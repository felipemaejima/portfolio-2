// Alertas forwarder: SNS (topics `alerts` and `kill_switch`) -> Discord #alertas, one embed per Alerta. AWS Chatbot
// has no Discord. The topics' email subscription stays the backstop: a Discord failure is only logged, never thrown.
// A loose file on purpose (packaged by Terraform, like kill-switch.mjs): it doesn't import the API's Discord code.
// Tests: alerts-forwarder.test.mjs (`make test-infra`).

const COLORS = { ALARM: 0xe5484d, OK: 0x30a46c };
const GREY = 0x8b8d98;
// https://discord.com/developers/docs/resources/message#embed-object-embed-limits (a blank field value is rejected)
const TITLE_MAX = 256;
const DESCRIPTION_MAX = 4096;
const FIELD_MAX = 1024;

const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const field = (name, value, inline = false) => ({ name, value: cut(String(value ?? '') || '—', FIELD_MAX), inline });
const killSwitchTripped = (details) => ({
  title: 'Disjuntor acionado: API desligada',
  description: cut(
    `A API responde erro até \`make api-enable\`, depois de investigar o gasto.\n\n${details}`,
    DESCRIPTION_MAX,
  ),
  color: COLORS.ALARM,
});

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The embed for one SNS notification, or null when it must not be sent. */
export function toEmbed({ TopicArn, Subject, Message }) {
  const data = parseJson(Message);
  const alarm = typeof data?.AlarmName === 'string' ? data : undefined;

  if (TopicArn === process.env.KILL_SWITCH_TOPIC) {
    // The compute alarm publishes to both topics and is sent from `alerts`. What's left here: the budget at 100%.
    return alarm ? null : killSwitchTripped(`O orçamento do mês passou de 100%.\n\n${Message}`);
  }

  if (alarm) {
    const reason = [alarm.AlarmDescription, alarm.NewStateReason].filter(Boolean).join('\n\n');
    if (alarm.AlarmName === process.env.KILL_SWITCH_ALARM && alarm.NewStateValue === 'ALARM') {
      return { ...killSwitchTripped(reason), fields: [field('Alarme', alarm.AlarmName)] };
    }
    return {
      title: cut(`Alarme: ${alarm.AlarmName}`, TITLE_MAX),
      description: cut(reason, DESCRIPTION_MAX),
      fields: [field('Estado', alarm.NewStateValue, true)],
      color: COLORS[alarm.NewStateValue] ?? GREY,
    };
  }

  if (data?.['detail-type'] === 'Access Analyzer Finding') {
    const { resource, resourceType, principal, action, isPublic } = data.detail ?? {};
    return {
      title: 'Acesso externo encontrado (Access Analyzer)',
      fields: [
        field('Recurso', resource),
        field('Tipo', resourceType, true),
        field('Público', isPublic ? 'sim' : 'não', true),
        field('Principal', principal && JSON.stringify(principal)),
        field('Ações', [action ?? []].flat().join(', ')),
      ],
      color: COLORS.ALARM,
    };
  }

  return unknown({ Subject, Message });
}

/** Unknown format, or one that broke the formatting: the raw text. No Alerta may be lost. */
const unknown = ({ Subject, Message }) => ({
  title: cut(Subject || 'Alerta', TITLE_MAX),
  description: cut(String(Message ?? '') || '—', DESCRIPTION_MAX),
  color: GREY,
});

export const discordBody = (embed) => JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } });

/**
 * Read on every run with the function's own role (free, and it runs only on Alertas): a swapped webhook applies to the
 * next Alerta. The URL is never in env vars, state or logs. Imported lazily so the tests run without the SDK, which
 * the runtime ships.
 */
async function loadWebhook() {
  const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
  const name = process.env.WEBHOOK_PARAMETER;
  return (await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }))).Parameter.Value;
}

export const handler = async (event) => {
  const webhook = await loadWebhook();
  for (const { Sns } of event.Records) {
    let embed;
    try {
      embed = toEmbed(Sns);
    } catch {
      embed = unknown(Sns);
    }
    if (!embed) continue;
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: discordBody(embed),
        signal: AbortSignal.timeout(5000),
      });
      // Discord's error names the rejected field and never echoes the URL.
      if (!response.ok) {
        console.error(`Discord webhook failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
      }
    } catch (error) {
      console.error(`Discord webhook failed: ${error.name}`); // never the message, which may quote the URL
    }
  }
};
