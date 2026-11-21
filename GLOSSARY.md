# Portfolio

Site pessoal: um site público com o trabalho do dono e um painel admin onde ele o edita.

## Avisos ao dono

**Visita**:
Alguém que não é o admin abriu o site público. Voltar em menos de 24 horas, pelo mesmo navegador ou da mesma rede, continua sendo a mesma Visita.
_Evitar_: acesso

**Login**:
O admin entrou no painel com e-mail e senha. Renovar uma sessão aberta ou errar a senha não é um Login.
_Evitar_: acesso

**Alerta**:
Aviso automático da AWS de que algo está errado em produção: erro, custo fora do previsto ou recurso exposto.
_Evitar_: alarme (um alarme do CloudWatch é só uma das fontes de Alerta)

**Mensagem de contato**:
O que um visitante envia pelo formulário de contato do site.
_Evitar_: solicitação de contato
