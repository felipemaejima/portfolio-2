# Portfolio

Site pessoal: um site público com o trabalho do dono e um painel admin onde ele o edita.

## Site público

**Projeto em destaque**:
Projeto que o dono marcou para aparecer na home e no CV. O que está no centro do carrossel da home num dado momento é o projeto em foco, não um projeto em destaque.
_Evitar_: destaque (para o projeto em foco)

## Avisos ao dono

**Visita**:
Alguém que não é o admin abriu o site público. Voltar em menos de 24 horas, pelo mesmo navegador ou da mesma rede, continua sendo a mesma Visita.
_Evitar_: acesso

**Login**:
O admin entrou no painel provando quem é: com e-mail e senha ou com uma Conta vinculada. Renovar uma sessão aberta ou uma tentativa recusada não é um Login.
_Evitar_: acesso

**Conta vinculada**:
Conta de um provedor externo (hoje, só o Google) que o admin associou ao painel para fazer Login sem senha.
_Evitar_: identidade, login social

**Alerta**:
Aviso automático da AWS de que algo está errado em produção: erro, custo fora do previsto ou recurso exposto.
_Evitar_: alarme (um alarme do CloudWatch é só uma das fontes de Alerta)

**Mensagem de contato**:
O que um visitante envia pelo formulário de contato do site.
_Evitar_: solicitação de contato
