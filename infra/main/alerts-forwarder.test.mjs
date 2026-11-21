// Formatting of the Alertas forwarder (alerts-forwarder.mjs): node --test, no dependencies (`make test-infra`).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discordBody, toEmbed } from './alerts-forwarder.mjs';

const ALERTS = 'arn:aws:sns:us-east-1:111122223333:portfolio-prod-alerts';
const KILL_SWITCH = 'arn:aws:sns:us-east-1:111122223333:portfolio-prod-kill-switch';
process.env.KILL_SWITCH_TOPIC = KILL_SWITCH;
process.env.KILL_SWITCH_ALARM = 'portfolio-prod-api-compute-runaway';

// As CloudWatch publishes an alarm to SNS (trimmed to the fields that matter).
const alarm = (name, state = 'ALARM') =>
  JSON.stringify({
    AlarmName: name,
    AlarmDescription: '10% or more of requests failed with 5xx over 5 minutes',
    NewStateValue: state,
    NewStateReason: 'Threshold Crossed: 1 datapoint [12.5] was greater than or equal to the threshold (10.0).',
    StateChangeTime: '2026-11-21T18:00:00.000+0000',
  });

test('a CloudWatch alarm shows its name, state and reason', () => {
  const embed = toEmbed({ TopicArn: ALERTS, Message: alarm('portfolio-prod-5xx') });
  assert.match(embed.title, /portfolio-prod-5xx/);
  assert.deepEqual(embed.fields, [{ name: 'Estado', value: 'ALARM', inline: true }]);
  assert.match(embed.description, /5xx over 5 minutes/);
  assert.match(embed.description, /Threshold Crossed/);
});

test('an Access Analyzer finding shows the exposed resource and who can reach it', () => {
  const finding = {
    'detail-type': 'Access Analyzer Finding',
    source: 'aws.access-analyzer',
    detail: {
      resource: 'arn:aws:s3:::portfolio-prod-uploads',
      resourceType: 'AWS::S3::Bucket',
      principal: { AWS: '*' },
      action: ['s3:GetObject'],
      isPublic: true,
      status: 'ACTIVE',
    },
  };
  const embed = toEmbed({ TopicArn: ALERTS, Message: JSON.stringify(finding) });
  assert.match(embed.title, /Access Analyzer/);
  const field = (name) => embed.fields.find((f) => f.name === name)?.value;
  assert.equal(field('Recurso'), 'arn:aws:s3:::portfolio-prod-uploads');
  assert.equal(field('Público'), 'sim');
  assert.equal(field('Ações'), 's3:GetObject');
  assert.match(field('Principal'), /"AWS":"\*"/);

  // A finding may lack principal and action (e.g. status with an error): Discord rejects blank field values.
  const detail = { resource: 'arn:aws:s3:::x', resourceType: 'AWS::S3::Bucket', error: 'ACCESS_DENIED' };
  const partial = { ...finding, detail };
  const fields = toEmbed({ TopicArn: ALERTS, Message: JSON.stringify(partial) }).fields;
  assert.ok(fields.every((f) => f.value.length > 0));
});

test('the budget tripping the kill switch says the API is off and how to turn it back on', () => {
  const budget = 'AWS Budget Notification\n\nBudget Name: portfolio-prod-monthly\nACTUAL Amount: $11.50';
  const embed = toEmbed({ TopicArn: KILL_SWITCH, Subject: 'AWS Budgets: monthly has exceeded', Message: budget });
  assert.match(embed.title, /Disjuntor/);
  assert.match(embed.description, /make api-enable/);
  assert.match(embed.description, /ACTUAL Amount: \$11\.50/);
});

test('the compute alarm trips the kill switch: one message, its copy on the kill switch topic is dropped', () => {
  const message = alarm('portfolio-prod-api-compute-runaway');
  assert.equal(toEmbed({ TopicArn: KILL_SWITCH, Message: message }), null);
  const embed = toEmbed({ TopicArn: ALERTS, Message: message });
  assert.match(embed.title, /Disjuntor/);
  assert.match(embed.description, /make api-enable/);
  assert.deepEqual(embed.fields, [{ name: 'Alarme', value: 'portfolio-prod-api-compute-runaway', inline: false }]);
});

test('an unknown format still arrives, as raw text, cut to Discord limits', () => {
  const embed = toEmbed({ TopicArn: ALERTS, Subject: 's'.repeat(300), Message: 'x'.repeat(5000) });
  assert.equal(embed.title.length, 256);
  assert.equal(embed.description.length, 4096);
  assert.ok(embed.description.endsWith('…'));
  assert.equal(toEmbed({ TopicArn: ALERTS, Message: '{"not":"an alarm"}' }).description, '{"not":"an alarm"}');
});

test('mentions are never parsed', () => {
  const embed = toEmbed({ TopicArn: ALERTS, Message: 'ping @everyone' });
  assert.deepEqual(JSON.parse(discordBody(embed)), { embeds: [embed], allowed_mentions: { parse: [] } });
});
