# Telão

Chat, canais de voz e compartilhamento de tela em salas com código, estilo Discord.
Funciona direto no navegador. O servidor (Node.js) entrega a página, junta as pessoas em salas,
repassa os sinais das chamadas (WebRTC) e guarda mensagens, fotos, banners e emojis.

## Recursos
- Salas com código e link de convite, e um canal de texto e de voz por sala
- Chamada de voz e compartilhamento de tela com áudio
- Chat com respostas, reações, edição, exclusão, formatação (`**negrito**`, `*itálico*`, `` `código` ``, `~~riscado~~`, `||spoiler||`), @menções, "está digitando" e envio de imagens e GIFs (até 700 KB)
- Perfil: foto e banner (GIF animado até 700 KB), efeito de nome, decoração de avatar, cor, status personalizado e temas
- Emojis personalizados por sala
- **Capri**, a assistente da sala: mais de 30 comandos (`/ajuda`), IA, economia de eddies, enquetes, lembretes e um retrato dela flutuando na tela
- **Arcade da Capri** (`/jogos`): Jogo da Velha, Breach Protocol, Snake e Digitação, com placar por sala

## Rodar no seu computador
```bash
npm install
npm start
```
Abra http://localhost:3000. Microfone e compartilhamento de tela só funcionam em `localhost` ou em HTTPS.

## Colocar no GitHub
```bash
git init
git add .
git commit -m "Telão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/telao.git
git push -u origin main
```

## Publicar no Render
1. No Render, clique em **New +** e depois **Web Service**, e conecte o repositório do GitHub.
   (Ou use **New + > Blueprint**: o arquivo `render.yaml` já tem tudo configurado.)
2. Preencha:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/healthz`
3. Clique em **Create Web Service**. Quando terminar, o Render dá um endereço `https://...onrender.com`.
   Mande esse endereço (ou o link de convite de uma sala) para os amigos.

### Pontos de atenção no plano gratuito
- **O serviço dorme** depois de uns 15 minutos sem acesso, e o primeiro acesso demora cerca de um minuto para acordar.
- **O disco é temporário.** Quando o serviço reinicia ou dorme, mensagens, fotos e salas criadas são apagadas.
  Para guardar tudo, use um plano pago com **Disk** (veja o bloco comentado no `render.yaml`):
  monte o disco em `/var/data` e defina a variável `DATA_DIR=/var/data`.
- Cada pessoa continua com as salas salvas no próprio navegador, mas o conteúdo delas fica no servidor.

## Ligar a IA da Capri
A IA usa a API do Gemini (Google). A chave **nunca** vai no código nem no GitHub: ela fica só como variável secreta no servidor.

1. Crie uma chave em https://aistudio.google.com/apikey
2. No Render, abra o serviço, vá em **Environment** e adicione `GEMINI_API_KEY` com o valor da chave.
3. Clique em **Save, rebuild and deploy** (ou **Manual Deploy**).

Sem a chave, tudo funciona, só a IA (`/capri`, `@capri`, `/resumir`, `/traduzir`...) responde que está fora do ar.
Para rodar no seu computador: `GEMINI_API_KEY=sua-chave npm start`.

Atenção:
- **Nunca** cole a chave em arquivos do projeto, no chat, em prints ou no GitHub. Se ela vazar, apague e crie outra no painel do Google.
- O texto dos pedidos e as últimas mensagens do canal são enviados ao Google para gerar a resposta.
- O servidor limita a 10 pedidos de IA por minuto por pessoa e 60 por minuto no total, para não estourar sua cota.

## Variáveis de ambiente (opcionais)
| Variável | Para que serve | Padrão |
|---|---|---|
| `PORT` | Porta do servidor (o Render define sozinho) | 3000 |
| `DATA_DIR` | Pasta onde o banco (`db.json`) é salvo | `./data` |
| `MAX_DB_MB` | Tamanho máximo do banco | 200 |
| `MAX_ROOM` | Máximo de pessoas por sala | 25 |
| `GEMINI_API_KEY` | Chave da IA da Capri (segredo) | desligada |
| `GEMINI_MODEL` | Modelo do Gemini usado pela Capri | gemini-2.5-flash |
| `ICE_SERVERS` | Lista JSON de servidores STUN/TURN | STUN do Google |

### Se a chamada não conectar para alguém
Algumas redes (celular, empresas) bloqueiam a conexão direta e precisam de um servidor TURN.
Contrate um (Metered, Twilio, Cloudflare Calls ou um coturn próprio) e defina, por exemplo:
```
ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:SEU-TURN:3478","username":"USUARIO","credential":"SENHA"}]
```

## Limitações
- **Sem contas nem senha:** o apelido e a foto são só o que cada pessoa escolhe, e quem tem o código entra na sala. Qualquer pessoa na sala pode mexer em mensagens de outras pelo servidor. Use com amigos, não como serviço público.
- **Chamadas em malha:** cada pessoa se conecta a todas as outras, então compartilhar tela para muita gente pesa. Funciona bem com grupos pequenos (até uns 5 ou 6).
- **Arquivos grandes** (GIFs acima de 200 KB) ficam em pedaços no banco e não são apagados automaticamente. Se o banco encher, novos envios falham.

## Estrutura
```
server.js            servidor HTTP + WebSocket (salas, presença, banco em arquivo JSON) e proxy da IA
public/index.html    a interface
public/telao-net.js  conecta a interface ao servidor
render.yaml          configuração para o Render
```
