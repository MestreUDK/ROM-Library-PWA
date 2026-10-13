# ROM Library PWA — v0.1.0

Site estático e aplicativo instalável para **catalogar e localizar** ROMs e emuladores enviados ao Telegram. O site **não hospeda, envia ou faz download direto de arquivos**: o botão `Abrir no Telegram` direciona à mensagem cadastrada.

## 1. Integração com o ROM Catalog Studio

Esta versão é **compatível com o Gerador ROM Catalog Studio v0.1.0**. Não é preciso converter o arquivo!

1. No **ROM Catalog Studio**, cadastre ROMs e emuladores com o link da **mensagem exata** do Telegram.
2. Use **Exportar JSON**; o gerador entrega `catalogo-roms.json`.
3. Neste projeto, **substitua o arquivo `catalogo-roms.json`** (na pasta principal) pelo exportado.
4. Publique as alterações no GitHub Pages. O PWA carrega o novo catálogo automaticamente quando online. Se já estiver aberto, use o ícone de **atualizar** no cabeçalho.

O JSON tem `schema_version: 1`, `games: [...]`, e utiliza campos `type`, `title`, `platform`, `cover_url`, `telegram_url`, etc. Nenhuma chave de API é necessária para exibir as capas que foram selecionadas no gerador.

> O catálogo inicial vem **vazio por segurança**. O exemplo em `exemplos/catalogo-exemplo.json` é apenas para testes: contém um link fictício de Telegram, que não baixa nenhum arquivo.

## 2. O que existe na v0.1.0

- Visual responsivo para celular/PC, tema escuro e tema claro.
- Capas remotas por `cover_url` do Libretro ou qualquer HTTPS válido; imagem substituta quando a capa não está disponível.
- Busca por nome, gênero, região, plataforma, idioma, notas e nome do arquivo, ignorando acentos.
- Filtros por tipo (ROM/emulador), console, região, ordenação e mais resultados progressivamente.
- Página de detalhes com metadados, notas e link para a mensagem do Telegram.
- Favoritos guardados **neste navegador**; não sincronizam entre aparelhos.
- Link de compartilhamento para uma ficha (endereço com `#jogo=<id>`).
- Botão **Testar JSON** para pré-visualizar um arquivo local **sem publicar nem modificar o catálogo do site**. Recarregar o site volta ao catálogo publicado.
- Manifest e Service Worker: aplicativo instalável em navegadores compatíveis, interface e JSON previamente visitados disponíveis offline. Algumas capas Libretro vistas anteriormente podem ficar em cache (até ~70). **Links do Telegram e capas externas não armazenadas exigem conexão**.
- Sem servidor próprio, sem banco de dados, sem API privada, sem bibliotecas externas, sem rastreamento.

## 3. Publicar no GitHub Pages

1. Crie um repositório para a ROM Library.
2. Envie **o conteúdo interno desta pasta** para a raiz do repositório (ou seja, `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `assets/` e `catalogo-roms.json` na raiz).
3. No GitHub, abra **Settings → Pages** e configure a publicação a partir da branch principal, diretório `/(root)`, ou use o workflow de publicação correspondente à sua configuração.
4. Abra a URL gerada (normalmente `https://seuusuario.github.io/nome-do-repositorio/`). Todos os caminhos do app são **relativos** e funcionam também em repositórios GitHub Pages com subdiretório.
5. Com HTTPS, em navegadores compatíveis, aparecerá a opção **Instalar app**; no iPhone/iPad, use o menu de compartilhamento → Adicionar à Tela de Início, caso disponível.

**Atenção:** GitHub Pages é **público por padrão para sites publicados**, conforme as permissões do seu plano/configuração. Não coloque arquivos privados, senhas, tokens ou dados que não deseja expor no JSON.

## 4. Executar localmente

O `index.html` pode abrir diretamente com `file://`, mas os navegadores normalmente **bloqueiam fetch de `catalogo-roms.json` nessa modalidade**. O botão `Testar JSON` pode ser usado para carregar um arquivo manualmente. Para testar o PWA como site:

```sh
cd ROM-Library-PWA-v0.1.0
python -m http.server 8000
```

Acesse `http://localhost:8000/` no navegador. Service Worker funciona com `localhost` e HTTPS (GitHub Pages). Abrir por `file://` não permite instalação como PWA.

## 5. Atualizar catálogos e arquivos estáticos

- **ROM nova:** adicione ao gerador, exporte, substitua `catalogo-roms.json`, envie ao GitHub. O PWA usa estratégia de rede primeiro para esse arquivo, com cópia para funcionar offline depois de visitado.
- **Atualização de interface:** além de alterar HTML/CSS/JS, incremente a constante `VERSION` em `sw.js` para substituir o cache dos arquivos estáticos nos aparelhos que já instalaram.
- **Capas:** a imagem é carregada diretamente da URL do JSON. O serviço externo pode deixar de servir a imagem; nesse caso, aparece um marcador de plataforma. O Libretro é um repositório de thumbnails, não uma API com garantia de disponibilidade.
- **Links privados:** quem não pertence a um grupo privado não consegue abrir suas mensagens. Use o link da **mensagem específica**, não apenas do tópico.

## 6. Limites e cuidados

- O aplicativo não indexa nem sincroniza automaticamente o Telegram. O catálogo depende do JSON que você publicar.
- O botão externo abre o Telegram; a forma de download depende das permissões do canal/grupo e do dispositivo.
- Favoritos/tema são locais a cada dispositivo e podem ser perdidos se o navegador limpar os dados.
- Não há modo de baixar ROMs offline: somente interface e catálogo podem ser acessados sem rede depois do cache.
- Distribua apenas ROMs, emuladores, imagens e BIOS com os direitos ou autorização necessários. O catálogo não concede licença sobre arquivos ou capas.

## Arquivos

- `index.html`: estrutura do site
- `styles.css`: layout e temas
- `app.js`: catálogo, filtros, favoritos, validação de links e interface
- `catalogo-roms.json`: **substituir por exportação do ROM Catalog Studio**
- `sw.js`: cache offline e atualizações
- `manifest.webmanifest`: instalação do app
- `assets/`: ícones do app
- `exemplos/`: amostra com mensagem de Telegram fictícia
- `.nojekyll`: publicação estática no GitHub Pages
