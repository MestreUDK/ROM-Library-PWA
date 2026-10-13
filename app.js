(() => {
  'use strict';
  const VERSION = '0.1.0';
  const CATALOG_PATH = './catalogo-roms.json';
  const PAGE_SIZE = 24;
  const STORAGE_THEME = 'rom-library-theme-v1';
  const STORAGE_FAVORITES = 'rom-library-favorites-v1';
  const PLATFORM_LIST = [
    ['nes','Nintendo / NES'],['snes','Nintendo / SNES'],['n64','Nintendo 64'],
    ['gb','Game Boy'],['gbc','Game Boy Color'],['gba','Game Boy Advance'],
    ['nds','Nintendo DS'],['3ds','Nintendo 3DS'],['gc','GameCube'],
    ['wii','Nintendo Wii'],['ps1','PlayStation 1'],['ps2','PlayStation 2'],
    ['psp','PlayStation Portable (PSP)'],['psvita','PS Vita'],
    ['sms','Sega Master System'],['md','Mega Drive / Genesis'],['gg','Sega Game Gear'],
    ['saturn','Sega Saturn'],['dreamcast','Sega Dreamcast'],
    ['pce','PC Engine / TurboGrafx-16'],['ngp','Neo Geo Pocket'],
    ['ngpc','Neo Geo Pocket Color'],['arcade','Arcade / MAME'],
    ['atari2600','Atari 2600'],['multi','Multiplataforma / PC'],['other','Outras plataformas']
  ];
  const platformNames = new Map(PLATFORM_LIST);
  const byId = id => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const state = {
    games: [], kind: 'all', platform: '', region: '', search: '', sort: 'title',
    favoritesOnly: false, favorites: new Set(), shown: PAGE_SIZE,
    preview: false, loaded: false, error: '', updated: '', warningCount: 0
  };
  let deferredInstallPrompt = null;
  const safely = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  const clean = s => String(s ?? '').trim();
  const normalize = s => clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const platformLabel = id => platformNames.get(id) || id || 'Outra plataforma';
  const number = n => new Intl.NumberFormat('pt-BR').format(n);
  const getSaved = key => safely(() => localStorage.getItem(key), null);
  const save = (key, val) => safely(() => localStorage.setItem(key, val), undefined);
  const icon = name => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use); return svg;
  };
  const node = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  function toast(message, type = 'info', button = null) {
    const e = node('div', 'toast ' + type, message);
    if (button) {
      const b = node('button', '', button.label);
      b.type = 'button'; b.addEventListener('click', () => { button.action(); e.remove(); }); e.append(b);
    }
    byId('toasts').append(e); window.setTimeout(() => e.remove(), 6200);
  }
  function telegramLink(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && ['t.me','www.t.me','telegram.me','www.telegram.me'].includes(u.hostname.toLowerCase()) && u.pathname !== '/' && !u.pathname.startsWith('/+') ? u.href : '';
    } catch { return ''; }
  }
  function coverLink(value) {
    if (!clean(value)) return '';
    try {
      const u = new URL(value, window.location.href);
      if (u.protocol === 'https:' || (u.origin === window.location.origin && ['http:', 'https:'].includes(u.protocol))) return u.href;
    } catch {}
    return '';
  }
  function readCatalog(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schema_version !== 1 || !Array.isArray(raw.games))
      throw new Error('JSON incompatível: esperado schema_version: 1 e games[].');
    if (raw.games.length > 50000) throw new Error('Catálogo maior que 50.000 registros. Divida o arquivo antes de importar.');
    const seen = new Set(), games = []; let skipped = 0;
    for (const item of raw.games) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { skipped++; continue; }
      const id = clean(item.id), title = clean(item.title), platform = clean(item.platform);
      if (!id || !title || !platform || seen.has(id)) { skipped++; continue; }
      seen.add(id);
      games.push({
        id, type: item.type === 'emulator' ? 'emulator' : 'rom', title, platform,
        file_name: clean(item.file_name), region: clean(item.region),
        languages: Array.isArray(item.languages) ? item.languages.map(clean).filter(Boolean).slice(0,30) : [],
        genre: clean(item.genre), year: Number.isInteger(item.year) && item.year >= 1970 && item.year <= 2100 ? item.year : null,
        size_mb: typeof item.size_mb === 'number' && Number.isFinite(item.size_mb) && item.size_mb >= 0 ? item.size_mb : null,
        format: clean(item.format), cover_url: coverLink(item.cover_url), telegram_url: telegramLink(item.telegram_url),
        notes: clean(item.notes), created_at: clean(item.created_at), updated_at: clean(item.updated_at)
      });
    }
    return {games, updated: clean(raw.exported_at), skipped};
  }
  function sizeLabel(value) {
    if (value === null) return '';
    if (value >= 1024) return new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2}).format(value / 1024) + ' GB';
    return new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2}).format(value) + ' MB';
  }
  function dateLabel(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('pt-BR', {day:'2-digit',month:'short',year:'numeric'}) : '';
  }
  function setTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = value;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', value === 'dark' ? '#0b1120' : '#f5f7fc');
    byId('themeButton').replaceChildren(icon(value === 'dark' ? 'sun' : 'moon'));
    byId('themeButton').setAttribute('aria-label', value === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
    save(STORAGE_THEME, value);
  }
  function setConnectivity() {
    const offline = !navigator.onLine;
    document.body.classList.toggle('offline',offline);
    byId('networkLabel').textContent = offline ? 'Offline' : 'Online';
    byId('offlineBanner').hidden = !offline;
  }
  function applyCatalog(content, preview) {
    const data = readCatalog(content);
    state.games = data.games;
    state.updated = data.updated;
    state.warningCount = data.skipped;
    state.preview = preview;
    state.loaded = true;
    state.error = '';
    state.shown = PAGE_SIZE;
    state.platform = ''; state.region = ''; state.kind = 'all'; state.search = '';
    state.favoritesOnly = false;
    byId('searchInput').value = '';
    byId('sortSelect').value = 'title'; state.sort = 'title';
    byId('previewBanner').hidden = !preview;
    renderAll(); openFromHash();
    if (data.skipped) toast(`${data.skipped} registro(s) inválido(s) ou duplicado(s) foram ignorados.`, 'error');
  }
  async function loadPublished(isRefresh = false) {
    byId('refreshButton').disabled = true;
    if (!state.loaded) byId('resultsSummary').textContent = 'Carregando catálogo...';
    try {
      const response = await fetch(CATALOG_PATH, {cache:'no-store'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const catalog = await response.json();
      applyCatalog(catalog, false);
      if (isRefresh) toast('Catálogo atualizado.', 'success');
    } catch (error) {
      if (!state.loaded || isRefresh) {
        state.error = error instanceof Error ? error.message : 'Falha desconhecida';
        state.loaded = true;
        if (!state.games.length) renderAll();
      }
      toast('Não foi possível carregar o catálogo publicado. Confira a conexão e o arquivo JSON.', 'error');
    } finally { byId('refreshButton').disabled = false; }
  }
  async function importLocal(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast('Arquivo maior que 15 MB.', 'error'); return; }
    try {
      const content = JSON.parse(await file.text());
      applyCatalog(content, true);
      toast(`${state.games.length} cadastro(s) carregado(s) para teste.`, 'success');
    } catch (error) { toast('Não foi possível importar: ' + (error?.message || 'JSON inválido'), 'error'); }
  }
  function countBy(items, name) {
    return items.reduce((obj, item) => { const val = item[name]; if (val) obj[val] = (obj[val] || 0) + 1; return obj; }, {});
  }
  function renderRegions() {
    const select = byId('regionSelect');
    const regions = [...new Set(state.games.map(x => x.region).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    select.replaceChildren(new Option('Todas as regiões',''));
    for (const region of regions) select.add(new Option(region, region));
    if (!regions.includes(state.region)) state.region = '';
    select.value = state.region;
  }
  function renderPlatforms() {
    const list = byId('platformList');
    const counts = countBy(state.games,'platform');
    const names = Object.keys(counts).sort((a,b) => {
      const ia = PLATFORM_LIST.findIndex(p=>p[0]===a), ib = PLATFORM_LIST.findIndex(p=>p[0]===b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
    });
    if (state.platform && !names.includes(state.platform)) state.platform = '';
    const fragment = document.createDocumentFragment();
    const entries = [['','Todas as plataformas',state.games.length], ...names.map(name => [name,platformLabel(name),counts[name]])];
    for (const [id,label,count] of entries) {
      const b = node('button', 'platform-item' + (state.platform === id ? ' selected' : ''));
      b.type = 'button'; b.dataset.platform = id;
      b.setAttribute('aria-pressed', String(state.platform === id)); b.title = label;
      b.append(node('span','platform-name',label),node('span','platform-count',number(count)));
      b.addEventListener('click',()=> {state.platform = id; state.shown = PAGE_SIZE; renderPlatforms(); renderGames();});
      fragment.append(b);
    }
    list.replaceChildren(fragment);
  }
  function renderKindTabs() {
    const counts = {all:state.games.length,rom:state.games.filter(g=>g.type==='rom').length,emulator:state.games.filter(g=>g.type==='emulator').length};
    byId('countAll').textContent = number(counts.all);
    byId('countRoms').textContent = number(counts.rom);
    byId('countEmulators').textContent = number(counts.emulator);
    for (const b of document.querySelectorAll('.kind-tab')) {
      const selected = b.dataset.kind === state.kind;
      b.classList.toggle('selected', selected);
      b.setAttribute('aria-pressed', String(selected));
    }
  }
  function renderStats() {
    byId('statGames').textContent = number(state.games.length);
    byId('statPlatforms').textContent = number(new Set(state.games.map(g=>g.platform)).size);
    byId('statFavorites').textContent = number(state.games.filter(g=>state.favorites.has(g.id)).length);
    byId('favoritesNavCount').textContent = number(state.games.filter(g=>state.favorites.has(g.id)).length);
    byId('navFavorites').classList.toggle('active', state.favoritesOnly);
    byId('navAll').classList.toggle('active', !state.favoritesOnly);
    byId('lastUpdate').textContent = state.updated ? 'Atualizado em ' + dateLabel(state.updated) : '';
  }
  function matchingGames() {
    const s = normalize(state.search);
    const result = state.games.filter(g=>{
      if (state.kind !== 'all' && g.type !== state.kind) return false;
      if (state.platform && g.platform !== state.platform) return false;
      if (state.region && g.region !== state.region) return false;
      if (state.favoritesOnly && !state.favorites.has(g.id)) return false;
      if (s && !normalize([g.title,g.file_name,g.platform,platformLabel(g.platform),g.region,g.genre,g.format,g.notes,...g.languages].join(' ')).includes(s)) return false;
      return true;
    });
    const titleOrder = (a,b) => a.title.localeCompare(b.title,'pt-BR',{sensitivity:'base',numeric:true});
    return result.sort((a,b)=>{
      if (state.sort === 'titleDesc') return -titleOrder(a,b);
      if (state.sort === 'recent') return (Date.parse(b.updated_at)||0) - (Date.parse(a.updated_at)||0) || titleOrder(a,b);
      if (state.sort === 'year') return (b.year||0) - (a.year||0) || titleOrder(a,b);
      if (state.sort === 'size') return (b.size_mb||0) - (a.size_mb||0) || titleOrder(a,b);
      return titleOrder(a,b);
    });
  }
  function addCover(target, game) {
    const placeholder = node('div','cover-fallback');
    placeholder.append(icon('gamepad'),node('span','',game.type === 'emulator' ? 'EMULADOR' : platformLabel(game.platform).toUpperCase()));
    target.append(placeholder);
    if (!game.cover_url) return;
    const img = document.createElement('img');
    img.alt = 'Capa de ' + game.title;
    img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('load',()=>placeholder.remove(),{once:true});
    img.addEventListener('error',()=>img.remove(),{once:true});
    target.append(img); img.src = game.cover_url;
  }
  function favoriteButton(game, extraClass = '') {
    const selected = state.favorites.has(game.id);
    const btn = node('button', 'fav-button' + (selected ? ' is-favorite' : '') + (extraClass ? ' '+extraClass : ''));
    btn.type = 'button'; btn.title = selected ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    btn.setAttribute('aria-label',btn.title); btn.setAttribute('aria-pressed',String(selected));
    btn.append(icon('heart'));
    btn.addEventListener('click',evt=>{evt.preventDefault(); evt.stopPropagation(); toggleFavorite(game.id);});
    return btn;
  }
  function telegramButton(game, cls, label) {
    const url = telegramLink(game.telegram_url);
    if (!url) { const s=node('span',cls+' disabled', 'Link indisponível');s.setAttribute('aria-disabled','true'); return s; }
    const a = node('a',cls);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.append(icon('external'),document.createTextNode(label));
    a.title = 'Abrir a mensagem do arquivo no Telegram'; return a;
  }
  function card(game) {
    const e = node('article','game-card');
    const imageButton = node('button','cover-button'); imageButton.type='button';
    imageButton.setAttribute('aria-label','Ver detalhes: '+game.title);
    addCover(imageButton,game);
    imageButton.append(node('span','type-badge',game.type==='emulator'?'EMULADOR':'ROM'));
    imageButton.addEventListener('click',()=>navigateToGame(game.id));
    e.append(imageButton,favoriteButton(game));
    const info=node('div','game-info');
    info.append(node('span','game-platform',platformLabel(game.platform)));
    const title=node('div','game-title',game.title);title.title=game.title;info.append(title);
    const meta=node('div','game-meta');
    for (const v of [game.year ? String(game.year):'',game.region,sizeLabel(game.size_mb)].filter(Boolean).slice(0,3)) meta.append(node('span','',v));
    info.append(meta,telegramButton(game,'card-telegram','Abrir no Telegram'));
    e.append(info);return e;
  }
  function showEmpty(reason) {
    const empty=byId('emptyState');empty.replaceChildren();empty.hidden=false;
    const cover=node('div','empty-icon');cover.append(icon(reason==='zero'||reason==='error'?'library':reason==='favorites'?'heart':'search'));
    let heading='',message='',action='';
    if(reason==='error') {heading='Não foi possível abrir a biblioteca';message='Confira se o arquivo catalogo-roms.json está publicado na mesma pasta do site. Ao abrir por arquivo local, use “Testar JSON” ou um servidor local.';action='Testar JSON';}
    else if(reason==='zero') {heading='Seu catálogo está pronto para começar';message='Gere o catalogo-roms.json no ROM Catalog Studio e substitua o arquivo de mesmo nome neste projeto. Você também pode testar um arquivo com o botão acima.';action='Testar JSON';}
    else if(reason==='favorites') {heading='Nenhum favorito por enquanto';message='Toque no coração de um jogo para encontrá-lo facilmente depois, neste navegador.';action='Ver biblioteca';}
    else {heading='Nenhum resultado encontrado';message='Tente outro termo ou limpe os filtros para descobrir mais jogos.';action='Limpar filtros';}
    empty.append(cover,node('h3','',heading),node('p','',message));
    const b=node('button','soft-button',action);b.type='button';
    b.addEventListener('click',()=>reason==='zero'||reason==='error'?byId('fileInput').click():reason==='favorites'?setFavoritesOnly(false):clearFilters());
    empty.append(b);
  }
  function renderGames() {
    const entries = matchingGames();
    const grid=byId('gamesGrid');grid.replaceChildren();
    const count=entries.length;
    const current=entries.slice(0,state.shown);
    const fragment=document.createDocumentFragment();
    for (const g of current) fragment.append(card(g));
    grid.append(fragment);
    let summary = `${number(count)} resultado${count===1?'':'s'}`;
    if (state.favoritesOnly) summary += ' nos seus favoritos';
    byId('resultsSummary').textContent = summary;
    byId('resultsFoot').hidden = current.length >= count || count===0;
    if (count===0) showEmpty(state.error && !state.games.length ? 'error' : !state.games.length ? 'zero' : state.favoritesOnly && !state.games.some(g=>state.favorites.has(g.id)) ? 'favorites' : 'filtered');
    else byId('emptyState').hidden=true;
  }
  function renderAll() { renderStats();renderRegions();renderPlatforms();renderKindTabs();renderGames(); }
  function toggleFavorite(id) {
    if(state.favorites.has(id))state.favorites.delete(id);else state.favorites.add(id);
    save(STORAGE_FAVORITES,JSON.stringify([...state.favorites]));
    renderStats(); renderGames();
    const dialog=byId('detailsDialog');
    if(dialog.open && new URLSearchParams(location.hash.replace(/^#/, '')).get('jogo')===id) renderDetails(state.games.find(g=>g.id===id));
  }
  function setFavoritesOnly(enabled) {
    state.favoritesOnly=enabled;state.shown=PAGE_SIZE;renderStats();renderGames();
    if(enabled) byId('colecao').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function clearFilters() {
    state.kind='all';state.platform='';state.region='';state.search='';state.sort='title';state.shown=PAGE_SIZE;
    byId('searchInput').value='';byId('regionSelect').value='';byId('sortSelect').value='title';
    renderPlatforms();renderKindTabs();renderGames();
  }
  function detailField(parent, label, value) {
    if(!value)return;
    const holder=node('div','detail-field');holder.append(node('dt','',label),node('dd','',value));parent.append(holder);
  }
  function renderDetails(game) {
    if(!game)return;
    const host=byId('dialogContents');host.replaceChildren();
    const close=node('button','details-close');close.type='button';close.setAttribute('aria-label','Fechar detalhes');close.append(icon('x'));close.addEventListener('click',()=>byId('detailsDialog').close());
    const body=node('div','details-body');const cover=node('div','details-cover');addCover(cover,game);
    const right=node('div','details-content');
    right.append(node('span','details-kind',game.type==='emulator'?'EMULADOR':'ROM · '+platformLabel(game.platform)),node('h2','',game.title));
    right.append(node('p','details-subtitle',platformLabel(game.platform)));
    const tags=node('div','detail-tags');
    for (const t of [game.genre,game.region,game.year?String(game.year):'',game.format?game.format.toUpperCase():''].filter(Boolean)) tags.append(node('span','detail-tag',t));
    right.append(tags);
    const fields=node('dl','detail-fields');
    detailField(fields,'Plataforma',platformLabel(game.platform));
    detailField(fields,'Tamanho',sizeLabel(game.size_mb));
    detailField(fields,'Idioma(s)',game.languages.join(', '));
    detailField(fields,'Região',game.region);
    detailField(fields,'Formato',game.format.toUpperCase());
    detailField(fields,'Ano',game.year?String(game.year):'');
    detailField(fields,'Nome do arquivo',game.file_name);
    right.append(fields);
    if (game.notes) right.append(node('p','details-notes',game.notes));
    const actions=node('div','detail-actions');
    actions.append(telegramButton(game,'detail-telegram','Abrir mensagem no Telegram'));
    const fav=node('button','detail-small-button'+(state.favorites.has(game.id)?' is-favorite':''));fav.type='button';fav.append(icon('heart'),document.createTextNode(state.favorites.has(game.id)?'Salvo':'Favoritar'));fav.addEventListener('click',()=>toggleFavorite(game.id));actions.append(fav);
    const share=node('button','detail-small-button');share.type='button';share.append(icon('share'));share.setAttribute('aria-label','Compartilhar link desta ficha');share.title='Compartilhar ficha';
    share.addEventListener('click',()=>shareGame(game));actions.append(share);
    right.append(actions);body.append(cover,right);host.append(close,body);
  }
  function navigateToGame(id) { location.hash = 'jogo=' + encodeURIComponent(id);openFromHash(); }
  function openFromHash() {
    const id = new URLSearchParams(location.hash.replace(/^#/, '')).get('jogo');
    const game = id && state.games.find(g=>g.id===id);
    const dialog = byId('detailsDialog');
    if(game) {renderDetails(game);if(!dialog.open)dialog.showModal();}
    else if(dialog.open) dialog.close();
  }
  function clearHash() {
    if(location.hash.startsWith('#jogo=')) {
      try { history.replaceState(null,'',location.pathname+location.search); }
      catch { location.hash = ''; } // documentos locais ou ambientes de teste sem origem HTTP
    }
  }
  async function shareGame(game) {
    const url=new URL(location.href);url.hash='jogo='+encodeURIComponent(game.id);
    try {
      if(navigator.share) { await navigator.share({title:game.title,text:'Veja este item no ROM Library',url:url.href});return; }
      if(navigator.clipboard) {await navigator.clipboard.writeText(url.href);toast('Link da ficha copiado.','success');return;}
    } catch (e) {if(e?.name==='AbortError')return;}
    window.prompt('Copie o link:',url.href);
  }
  function setupEvents() {
    byId('themeButton').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
    byId('refreshButton').addEventListener('click',()=>loadPublished(true));
    byId('navAll').addEventListener('click',()=>setFavoritesOnly(false));
    byId('navFavorites').addEventListener('click',()=>setFavoritesOnly(true));
    byId('searchInput').addEventListener('input',event=>{state.search=event.target.value;state.shown=PAGE_SIZE;renderGames();});
    byId('regionSelect').addEventListener('change',event=>{state.region=event.target.value;state.shown=PAGE_SIZE;renderGames();});
    byId('sortSelect').addEventListener('change',event=>{state.sort=event.target.value;state.shown=PAGE_SIZE;renderGames();});
    for(const tab of document.querySelectorAll('.kind-tab')) tab.addEventListener('click',()=>{state.kind=tab.dataset.kind;state.shown=PAGE_SIZE;renderKindTabs();renderGames();});
    byId('clearFiltersButton').addEventListener('click',clearFilters);
    byId('moreButton').addEventListener('click',()=>{state.shown+=PAGE_SIZE;renderGames();});
    byId('importButton').addEventListener('click',()=>byId('fileInput').click());
    byId('fileInput').addEventListener('change',async event=>{await importLocal(event.target.files?.[0]);event.target.value='';});
    byId('resetPreviewButton').addEventListener('click',()=>loadPublished(true));
    byId('detailsDialog').addEventListener('close',clearHash);
    byId('detailsDialog').addEventListener('click',event=>{if(event.target===byId('detailsDialog'))byId('detailsDialog').close();});
    window.addEventListener('hashchange',openFromHash);
    window.addEventListener('online',setConnectivity);
    window.addEventListener('offline',setConnectivity);
    document.addEventListener('keydown',event=>{
      if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!byId('detailsDialog').open){event.preventDefault();byId('searchInput').focus();}
    });
    window.addEventListener('beforeinstallprompt',evt=>{evt.preventDefault();deferredInstallPrompt=evt;byId('installButton').hidden=false;});
    byId('installButton').addEventListener('click',async()=>{
      if(!deferredInstallPrompt)return;
      const prompt=deferredInstallPrompt;deferredInstallPrompt=null;byId('installButton').hidden=true;
      await prompt.prompt();
    });
    window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;byId('installButton').hidden=true;toast('ROM Library instalado.','success');});
  }
  async function registerServiceWorker() {
    if(!('serviceWorker' in navigator) || !['http:','https:'].includes(location.protocol))return;
    try {
      const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      registration.addEventListener('updatefound',()=>{
        const next=registration.installing;
        if(!next)return;
        next.addEventListener('statechange',()=>{
          if(next.state==='installed'&&navigator.serviceWorker.controller)
            toast('Nova versão do aplicativo disponível.','info',{label:'Recarregar',action:()=>location.reload()});
        });
      });
    }catch(error){console.warn('Service Worker:',error);}
  }
  function start() {
    state.favorites=new Set(safely(()=>JSON.parse(getSaved(STORAGE_FAVORITES)||'[]'),[]).filter?.(x=>typeof x==='string')||[]);
    setTheme(getSaved(STORAGE_THEME)==='light'?'light':'dark');
    setConnectivity();setupEvents();renderAll();loadPublished();registerServiceWorker();
    if(location.protocol==='file:') toast('Para usar como PWA, publique no GitHub Pages. Você pode testar o JSON local usando “Testar JSON”.');
    console.info('ROM Library PWA '+VERSION+' • formato ROM Catalog Studio v1');
  }
  start();
})();
