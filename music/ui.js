/* Music is a persistent application surface; opening it never replaces the chat document. */
(function (App) {
  'use strict';
  const paths = {
    music:'M9 18V5l11-2v13M9 9l11-2M9 18c0 1.7-1.6 3-3.5 3S2 19.7 2 18s1.6-3 3.5-3S9 16.3 9 18Zm11-2c0 1.7-1.6 3-3.5 3S13 17.7 13 16s1.6-3 3.5-3S20 14.3 20 16Z',
    plus:'M12 5v14M5 12h14', back:'m14 5-7 7 7 7', close:'m6 6 12 12M18 6 6 18',
    play:'m8 4 12 8-12 8V4Z', edit:'m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z',
    more:'M5 12h.01M12 12h.01M19 12h.01', delete:'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
    up:'m5 14 7-7 7 7', down:'m5 10 7 7 7-7', clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    upload:'M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6'
  };
  const svg = name => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${paths[name] || paths.music}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if(cls) node.className=cls; if(text != null) node.textContent=text; return node; };
  const button = (label, icon, run, cls='music-icon-button') => { const b=el('button',cls); b.type='button'; b.setAttribute('aria-label',label); b.dataset.tooltip=label; b.innerHTML=svg(icon); b.onclick=run; return b; };
  const setText = (node,value) => { if(node && node.textContent!==String(value ?? '')) node.textContent=String(value ?? ''); };
  const values = value => value instanceof Map ? [...value.values()] : Object.values(value || {});
  const playlist = id => App.musicData?.playlists?.get?.(id) || App.musicData?.playlists?.[id];
  const collection = id => App.musicLibraryOwner(id) ? { id, ownerCode: App.musicLibraryOwner(id), library: true } : playlist(id);
  const user = code => App.musicData?.users?.get?.(code) || App.liveUserCache?.get?.(code) || (App.currentUser?.code === code ? App.currentUser : null) || {code};
  const canEdit = record => App.musicCanManage(record?.ownerCode);
  const name = person => String(person?.displayName || person?.username || 'User');
  const report = error => App.showToast?.({ title:'Music', body:error?.message || 'Could not complete that action.', duration:4000 });
  const run = promise => Promise.resolve(promise).catch(report);
  const tracks = id => App.musicGetTracks?.(id) || [];
  const stamp = () => App.accurateNowMs?.() || Date.now();
  const time = seconds => { seconds=Math.max(0,Math.floor(Number(seconds)||0)); return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; };
  const ago = addedAt => {
    const seconds=Math.max(0,Math.floor((stamp()-Number(addedAt || stamp()))/1000));
    if(seconds<60) return seconds<2?'Just now':`${seconds} seconds ago`;
    const scales=[[31536000,'year'],[2592000,'month'],[604800,'week'],[86400,'day'],[3600,'hour'],[60,'minute']];
    const [scale,label]=scales.find(([scale])=>seconds>=scale); const n=Math.floor(seconds/scale); return `${n} ${label}${n===1?'':'s'} ago`;
  };
  function cover(frame,record) {
    const source=String(record?.photoDataURL || '');
    if(source) {
      let image=frame.querySelector('img'); if(!image) { frame.replaceChildren(); image=el('img'); image.alt=''; frame.append(image); }
      App.applyCroppedImage(image,source,record?.photoTransform,132,132);
    } else if(frame.dataset.default!=='1' || frame.querySelector('img')) { frame.innerHTML=svg('music'); }
    frame.dataset.default=source?'0':'1';
  }
  function keyed(container,items,key,create,patch) {
    const existing=new Map([...container.children].map(node=>[node.dataset.musicKey,node]));
    const nodes=items.map(item=>{ const id=String(key(item)); const node=existing.get(id)||create(item); node.dataset.musicKey=id; patch(node,item); return node; });
    if(App.reconcileChildren) App.reconcileChildren(container,nodes);
    else { const keep=new Set(nodes); for(const node of [...container.children]) if(!keep.has(node)) node.remove(); nodes.forEach((node,index)=>{ if(container.children[index]!==node) container.insertBefore(node,container.children[index]||null); }); }
  }
  function empty(parent,text) {
    let node=parent.querySelector(':scope > .music-empty'); if(!node) { node=el('p','music-empty'); parent.append(node); } setText(node,text);
  }
  function movePlaylistBy(record, distance) {
    if (!canEdit(record)) return;
    const list = App.musicGetPlaylists(record.ownerCode);
    const index = list.findIndex(item => item.id === record.id);
    const target = list[index + distance];
    if (index >= 0 && target) return App.musicMovePlaylist(record.id, target.id, distance < 0 ? 'before' : 'after');
  }
  function bindPlaylistReorder(node) {
    const record = () => playlist(node.dataset.musicKey);
    node.onkeydown = event => {
      if (!event.altKey || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key) || !canEdit(record())) return;
      event.preventDefault();
      run(movePlaylistBy(record(), ['ArrowUp','ArrowLeft'].includes(event.key) ? -1 : 1));
    };
    node.ondragstart = event => {
      if (!canEdit(record())) { event.preventDefault(); return; }
      App.musicDraggingPlaylist = node.dataset.musicKey;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.dataset.musicKey);
      node.classList.add('music-dragging');
    };
    node.ondragover = event => {
      if (!App.musicDraggingPlaylist || App.musicDraggingPlaylist === node.dataset.musicKey || !canEdit(record())) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; node.classList.add('music-drop-target');
    };
    node.ondragleave = () => node.classList.remove('music-drop-target');
    node.ondrop = event => {
      event.preventDefault(); node.classList.remove('music-drop-target');
      const source = App.musicDraggingPlaylist, target = record();
      if (!source || !canEdit(target)) return;
      const ids = App.musicGetPlaylists(target.ownerCode).map(p => p.id);
      run(App.musicMovePlaylist(source, target.id, ids.indexOf(source) < ids.indexOf(target.id) ? 'after' : 'before'));
    };
    node.ondragend = () => {
      App.musicDraggingPlaylist = null; node.classList.remove('music-dragging');
      document.querySelectorAll('.music-playlist-card.music-drop-target').forEach(item => item.classList.remove('music-drop-target'));
    };
  }
  function cards(container,list) {
    keyed(container,list,p=>p.id,record=>{
      const node=el('button','music-playlist-card'); node.type='button';
      node.append(el('span','music-cover'),el('span','music-card-name'));
      node.onclick=()=>App.openMusic({kind:'playlist',id:node.dataset.musicKey});
      node.oncontextmenu=event=>{event.preventDefault(); const p=playlist(node.dataset.musicKey); App.openMusicMenu(event,node,p);};
      bindPlaylistReorder(node);
      return node;
    },(node,p)=>{ node.draggable=canEdit(p); cover(node.firstElementChild,p); setText(node.lastElementChild,p.name); node.title=p.name; node.setAttribute('aria-label',p.name||'Playlist'); });
    if(!list.length) empty(container,App.musicData?.error || (App.musicData?.loaded?'No playlists yet.':'Loading…'));
  }
  function section(title,ownerCode=null) {
    const node=el('section','music-section'),head=el('div','music-section-heading'); head.append(el('h2',null,title));
    if(App.musicCanManage(ownerCode)) head.append(button('Create Playlist','plus',()=>App.openMusicPlaylistEditor(null,ownerCode)));
    node.append(head); return node;
  }
  function trackTable(label, rowsId) {
    const table = el('div', 'music-track-table');
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', label);
    table.innerHTML = `<div class="music-track-head" role="row"><span role="columnheader">#</span><span role="columnheader">Title</span><span class="music-album-column" role="columnheader">Album</span><span class="music-added-column" role="columnheader">Date added</span><span class="music-duration-column" role="columnheader" aria-label="Duration">${svg('clock')}</span><span></span></div><div role="rowgroup"></div>`;
    table.lastElementChild.id = rowsId;
    return table;
  }
  function uploadButton(collectionId) {
    const upload = el('button', 'btn primary', 'Upload');
    upload.type = 'button'; upload.id = 'music-upload'; upload.onclick = () => pickAudio(collectionId);
    return upload;
  }
  function audioSection(ownerCode) {
    const pane = section('Audio'), destination = ownerCode || App.currentUser.code;
    if (App.musicCanManage(destination)) pane.firstElementChild.append(uploadButton(App.musicLibraryId(destination)));
    const field = el('label', 'app-search-field music-library-search');
    field.innerHTML = '<input class="app-search-input" id="music-audio-search" type="search" aria-label="Search audio by name, artist, or album" placeholder="Search by name, artist, or album" autocomplete="off">';
    field.firstElementChild.oninput = () => { renderAudios(ownerCode); App.$('music-audios').parentElement.scrollTop = 0; };
    const table = trackTable('Audio', 'music-audios');
    table.classList.add('music-library-list');
    pane.append(field, table);
    return pane;
  }
  function renderAudios(ownerCode) {
    const query = App.$('music-audio-search').value.trim().toLocaleLowerCase();
    const sorted = App.musicGetAudios(ownerCode).filter(t => !query || [t.title, t.artist, t.album].some(value => String(value || '').toLocaleLowerCase().includes(query)));
    let index = 0;
    keyed(App.$('music-audios'), sorted, t => t.id, t => createTrackRow(t.playlistId), (row, t) => patchTrackRow(row, t, collection(t.playlistId), index++));
    if (!sorted.length) empty(App.$('music-audios'), App.musicData.error || (query ? 'No matching audio.' : App.musicData.loaded ? 'No audio yet.' : 'Loading…'));
  }
  function buildView() {
    const main=App.$('music-content'),view=App.musicView;
    main.replaceChildren(); main.scrollTop=0; main.dataset.view=view.kind;
    if(view.kind==='home'||view.kind==='all'||view.kind==='user') {
      if(view.kind==='user') {
        const header=el('div','music-user-heading'); header.append(el('div','music-user-avatar'),el('h1')); main.append(header);
      }
      const playlists=section('Playlists',view.kind==='user'?view.id:App.currentUser?.code); playlists.id='music-playlists-section';
      const viewAll=el('button','btn tiny music-view-all','View All'); viewAll.id='music-view-all';viewAll.type='button';viewAll.onclick=()=>App.openMusic({kind:'all'});playlists.firstElementChild.append(viewAll);
      const grid=el('div',view.kind==='home'?'music-playlist-row':'music-playlist-grid');grid.id='music-playlists';playlists.append(grid);main.append(playlists);
      if(view.kind!=='all') main.append(audioSection(view.kind==='user'?view.id:null));
      if(view.kind==='home') {const users=section('Users'); const row=el('div','music-user-row'); row.id='music-users';users.append(row);main.append(users);}
    } else if(view.kind==='playlist') {
      const hero=el('section','music-playlist-heading'); hero.innerHTML='<div class="music-cover music-hero-cover"></div><div class="music-playlist-heading-copy"><h1></h1><button type="button" class="music-owner-link"></button><div class="music-playlist-actions"></div></div>';main.append(hero);
      const table = trackTable('Tracks','music-tracks');
      main.append(table);
      bindTrackReorder(table.lastElementChild, view.id, main);
    }
  }
  App.renderMusic = function () {
    if(!App.musicScreenOpen||!App.$('music-content')) return;
    const view=App.musicView || {kind:'home'};
    const viewKey=`${view.kind}:${view.id||''}:${App.currentUser?.code}:${!!App.isVinny?.()}`;
    if(App.$('music-content').dataset.viewKey!==viewKey) {buildView();App.$('music-content').dataset.viewKey=viewKey;}
    App.$('music-back').hidden=view.kind==='home';
    if(view.kind==='home'||view.kind==='all'||view.kind==='user') {
      const ownerCode=view.kind==='user'?view.id:App.currentUser?.code;
      const all=App.musicGetPlaylists(ownerCode);
      cards(App.$('music-playlists'),view.kind==='home'?all.slice(0,6):all);
      App.$('music-view-all').hidden=view.kind!=='home'||all.length<=6;
      if(view.kind!=='all') renderAudios(view.kind==='user' ? ownerCode : null);
      if(view.kind==='user') { const person=user(view.id),head=App.$('music-content').querySelector('.music-user-heading'); App.applyAvatar(head.firstElementChild,{...person,code:view.id});setText(head.lastElementChild,name(person)); }
      if(view.kind==='home') {
        const people=values(App.musicData?.users).sort((a,b)=>name(a).localeCompare(name(b),undefined,{sensitivity:'base',numeric:true})||String(a.code).localeCompare(String(b.code)));
        keyed(App.$('music-users'),people,u=>u.code,()=>{ const b=el('button','music-user-card');b.type='button';b.append(el('span','music-user-avatar'),el('span','music-card-name'));b.onclick=()=>App.openMusic({kind:'user',id:b.dataset.musicKey});return b; },(b,p)=>{App.applyAvatar(b.firstElementChild,p);setText(b.lastElementChild,name(p));b.setAttribute('aria-label',name(p));});
        if(!people.length) empty(App.$('music-users'),'No users yet.');
      }
    } else if(view.kind==='playlist') renderPlaylist(playlist(view.id));
    App.renderMusicPlayer?.();
  };
  function renderPlaylist(record) {
    const main=App.$('music-content');
    if(!record) {main.querySelector('.music-playlist-heading')?.setAttribute('hidden','');main.querySelector('.music-track-table')?.setAttribute('hidden','');empty(main,App.musicData?.error || (App.musicData?.loaded?'This playlist is unavailable.':'Loading…'));return;}
    main.querySelector(':scope > .music-empty')?.remove();main.querySelector('.music-playlist-heading').hidden=false;main.querySelector('.music-track-table').hidden=false;
    cover(main.querySelector('.music-hero-cover'),record);setText(main.querySelector('h1'),record.name);
    const owner=main.querySelector('.music-owner-link');setText(owner,name(user(record.ownerCode)));owner.onclick=()=>App.openMusic({kind:'user',id:record.ownerCode});
    const actions=main.querySelector('.music-playlist-actions'),permission=String(canEdit(record));
    if(actions.dataset.permission!==permission) {
      actions.dataset.permission=permission;actions.replaceChildren();
      if(canEdit(record)) actions.append(uploadButton(record.id));
      const play=button('Play Playlist','play',()=>{const first=tracks(record.id)[0];if(first)run(App.musicPlay(record.id,first.id));},'btn music-play-playlist');play.id='music-play-playlist';actions.append(play);
      if(canEdit(record)) actions.append(button('Edit Playlist','edit',()=>App.openMusicPlaylistEditor(record.id)),button('Playlist Menu','more',event=>App.openMusicMenu(event,event.currentTarget,playlist(record.id))));
    }
    const ordered=tracks(record.id);App.$('music-play-playlist').disabled=!ordered.length||!!App.musicJamIsGuest?.();
    let index = 0;
    keyed(App.$('music-tracks'),ordered,t=>t.id,()=>createTrackRow(record.id),(row,t)=>patchTrackRow(row,t,record,index++));
    if(!ordered.length) empty(App.$('music-tracks'),'No tracks yet.');
  }
  function createTrackRow(playlistId) {
    const row=el('div','music-track-row');row.setAttribute('role','row');row.tabIndex=0;
    row.innerHTML='<button class="music-track-number" type="button" aria-label="Play"><span></span>'+svg('play')+'</button><div class="music-track-title-cell" role="cell"><span class="music-cover music-track-cover"></span><span class="music-track-copy"><span class="music-track-title"></span><span class="music-track-artist"></span><span class="music-compact-album"></span><time class="music-compact-added"></time></span></div><span class="music-album-column" role="cell"></span><time class="music-added-column" role="cell"></time><span class="music-duration-column" role="cell"></span>';
    const openMenu = event => { event.stopPropagation(); App.openMusicMenu(event,row,collection(row.musicTrack.playlistId),row.musicTrack); };
    row.append(button('Track Menu','more',openMenu));
    const play=()=>{if(!App.musicJamIsGuest?.())run(App.musicPlay(row.musicTrack.playlistId,row.dataset.musicKey));};
    row.onpointerenter = () => {
      clearTimeout(row.musicWarmTimer);
      row.musicWarmTimer = setTimeout(() => { if (row.isConnected) App.musicWarmTrack?.(row.musicTrack); }, 120);
    };
    row.onpointerleave = () => clearTimeout(row.musicWarmTimer);
    row.onfocusin = () => App.musicWarmTrack?.(row.musicTrack);
    row.addEventListener('pointerdown', () => App.musicWarmTrack?.(row.musicTrack));
    row.onclick=event=>{if(event.target.closest('.music-icon-button'))return;play();};
    row.onkeydown=event=>{if(event.target!==row)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();play();}if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();run(moveTrack(playlistId,row.dataset.musicKey,event.key==='ArrowUp'?-1:1));}};
    row.oncontextmenu=openMenu;
    return row;
  }
  function patchTrackRow(row,t,p,index) {
    row.classList.toggle('music-reorderable', !p.library&&canEdit(p));
    setText(row.querySelector('.music-track-number span'),index+1);
    row.querySelector('.music-track-number').disabled=!!App.musicJamIsGuest?.();
    row.classList.toggle('is-playing',App.musicState?.trackId===t.id&&App.musicState?.playlistId===p.id);
    if (row.musicTrack === t) return;
    row.musicTrack=t;row.dataset.addedAt=String(t.addedAt||'');cover(row.querySelector('.music-track-cover'),t);
    setText(row.querySelector('.music-track-title'),t.title);setText(row.querySelector('.music-track-artist'),t.artist);row.querySelector('.music-track-artist').hidden=!t.artist;
    setText(row.querySelector('.music-album-column'),t.album||'');setText(row.querySelector('.music-added-column'),ago(t.addedAt));
    setText(row.querySelector('.music-compact-album'),t.album||'');row.querySelector('.music-compact-album').hidden=!t.album;setText(row.querySelector('.music-compact-added'),ago(t.addedAt));
    setText(row.querySelector('.music-duration-column'),time(t.duration));row.setAttribute('aria-label',`${t.title}${t.artist?' by '+t.artist:''}`);
  }
  function moveTrack(playlistId,trackId,delta) {
    if(!canEdit(playlist(playlistId))) return;
    const list = tracks(playlistId), index = list.findIndex(t => t.id === trackId), target = list[index + delta];
    if(index >= 0 && target) return App.musicMoveTrack(playlistId, trackId, target.id, delta > 0);
  }
  App.refreshMusicTrackOrder = function (playlistId) {
    const group = App.$('music-tracks');
    if (!group || !App.musicScreenOpen || App.musicView.id !== playlistId) return;
    const active = group.contains(document.activeElement) ? document.activeElement : null;
    const rows = new Map(Array.from(group.children, row => [row.dataset.musicKey, row]));
    const ordered = tracks(playlistId).map(track => rows.get(track.id));
    if (ordered.length !== rows.size || ordered.some(row => !row)) return renderPlaylist(playlist(playlistId));
    App.reconcileChildren(group, ordered);
    ordered.forEach((row, i) => setText(row.querySelector('.music-track-number span'), i + 1));
    if (active && document.activeElement !== active) active.focus({preventScroll:true});
  };
  function bindTrackReorder(group, playlistId, scroller) {
    // Capture only once a press becomes a drag. Touch users drag the artwork
    // and can still pan the rest of a row, tap Play, or use its menu.
    group.onpointerdown = down => {
      const row = down.target.closest('.music-reorderable');
      if (!row || !down.isPrimary || down.button !== 0 || down.target.closest('button') ||
          (down.pointerType === 'touch' && !down.target.closest('.music-track-cover'))) return;
      const listeners = new AbortController(), options = { signal: listeners.signal };
      const pointer = down.pointerId;
      let x = down.clientX, y = down.clientY, dragging = false, frame = 0, lastFrame = 0;
      let target = null, after = false;
      function mark(next, below) {
        if (target === next && below === after) return;
        target?.classList.remove('music-drop-before', 'music-drop-after');
        target = next;
        after = below;
        target?.classList.add(after ? 'music-drop-after' : 'music-drop-before');
      }
      function update(now, scroll = true) {
        frame = 0;
        if (!row.isConnected || !App.musicScreenOpen || !canEdit(playlist(playlistId))) { finish(); return; }
        const box = scroller.getBoundingClientRect();
        const within = x >= box.left && x < box.right && y >= box.top - 16 && y <= box.bottom + 16;
        if (!within) { mark(null, false); return; }
        const edge = Math.min(70, box.height / 5);
        const speed = Math.min(1, Math.max(0, (y - box.bottom + edge) / edge)) -
          Math.min(1, Math.max(0, (box.top + edge - y) / edge));
        const previous = scroller.scrollTop;
        if (scroll && speed) scroller.scrollTop += speed * Math.min(now - lastFrame || 16, 32) * 0.9;
        lastFrame = now;
        const probeY = Math.max(box.top + 1, Math.min(box.bottom - 1, y));
        let hit = document.elementFromPoint(x, probeY)?.closest('.music-track-row');
        if (!hit) {
          const bounds = group.getBoundingClientRect();
          if (probeY < bounds.top) hit = group.firstElementChild;
          else if (probeY >= bounds.bottom) hit = group.lastElementChild;
        }
        if (hit && hit !== row && group.contains(hit)) {
          const rect = hit.getBoundingClientRect(), middle = rect.top + rect.height / 2;
          const below = Math.abs(y - middle) < 2 ? !!(row.compareDocumentPosition(hit) & Node.DOCUMENT_POSITION_FOLLOWING) : y > middle;
          mark(hit, below);
        } else mark(null, false);
        if (scroll && speed && scroller.scrollTop !== previous) frame = requestAnimationFrame(update);
      }
      function finish(commit = false) {
        if (frame) cancelAnimationFrame(frame);
        listeners.abort();
        if (group.hasPointerCapture(pointer)) group.releasePointerCapture(pointer);
        row.classList.remove('music-dragging');
        if (commit && dragging && target?.isConnected && row.isConnected) {
          run(App.musicMoveTrack(playlistId, row.dataset.musicKey, target.dataset.musicKey, after));
        }
        mark(null, false);
      }
      window.addEventListener('pointermove', event => {
        if (event.pointerId !== pointer) return;
        x = event.clientX; y = event.clientY;
        if (!dragging) {
          if (Math.hypot(x - down.clientX, y - down.clientY) < 5) return;
          if (!group.isConnected) { finish(); return; }
          dragging = true; row.classList.add('music-dragging'); group.setPointerCapture(pointer);
        }
        if (!frame) frame = requestAnimationFrame(update);
      }, options);
      window.addEventListener('pointerup', event => {
        if (event.pointerId !== pointer) return;
        if (frame) cancelAnimationFrame(frame);
        if (dragging) { x = event.clientX; y = event.clientY; update(performance.now(), false); }
        finish(true);
      }, options);
      const cancel = event => { if (event.pointerId === pointer) finish(); };
      window.addEventListener('pointercancel', cancel, options);
      group.addEventListener('lostpointercapture', event => { if (event.target === group) cancel(event); }, options);
      window.addEventListener('blur', () => finish(), options);
    };
  }
  App.refreshMusicTrackStates = function () {
    const group = App.musicScreenOpen && (App.$('music-tracks') || App.$('music-audios'));
    if (!group) return;
    const guest = !!App.musicJamIsGuest?.(), { trackId, playlistId } = App.musicState || {};
    const previous = group.musicPlayback;
    if (previous?.guest === guest && previous.trackId === trackId && previous.playlistId === playlistId) return;
    group.musicPlayback = {guest, trackId, playlistId};
    const play = App.$('music-play-playlist');
    if (play) play.disabled = guest || !App.musicData.tracks.get(App.musicView.id)?.size;
    for(const row of group.children) {
      const button=row.querySelector('.music-track-number');
      if(button) button.disabled=guest;
      row.classList.toggle('is-playing',!!row.musicTrack && row.dataset.musicKey === trackId && row.musicTrack.playlistId === playlistId);
    }
  };
  App.openMusicMenu = function (event,anchor,p,t=null) {
    if(!p)return;event?.preventDefault?.();event?.stopPropagation?.();App.closeMsgMenu?.(true);
    let menu=App.$('music-context-menu');if(!menu){menu=el('div','msg-menu');menu.id='music-context-menu';menu.hidden=true;document.body.append(menu);}menu.replaceChildren();
    const item=(label,icon,callback,danger=false)=>{const b=button(label,icon,()=>{App.closeContextMenu(menu,{immediate:true});run(callback());},`msg-menu-btn${danger?' danger':''}`);b.innerHTML=`<span class="msg-menu-icon">${svg(icon)}</span><span class="msg-menu-label">${App.escapeHtml(label)}</span>`;b.removeAttribute('data-tooltip');menu.append(b);return b;};
    item('Play','play',()=>{const track=t||tracks(p.id)[0];if(track)return App.musicPlay(p.id,track.id);}).disabled=!!App.musicJamIsGuest?.();
    if(canEdit(p)) {
      item('Edit','edit',()=>t?App.openMusicTrackEditor(p.id,t):App.openMusicPlaylistEditor(p.id));
      if(t&&!p.library){const all=tracks(p.id),i=all.findIndex(x=>x.id===t.id);if(i>0)item('Move Up','up',()=>moveTrack(p.id,t.id,-1));if(i<all.length-1)item('Move Down','down',()=>moveTrack(p.id,t.id,1));}
      else if(!t) {
        const all=App.musicGetPlaylists(p.ownerCode),i=all.findIndex(x=>x.id===p.id);
        if(i>0)item('Move Up','up',()=>movePlaylistBy(p,-1));
        if(i>=0&&i<all.length-1)item('Move Down','down',()=>movePlaylistBy(p,1));
      }
      item('Delete','delete',()=>App.confirmMusicDelete(p,t),true);
    }
    const destinations = App.musicDestinationPlaylists(p.id,t);
    if (destinations.length) {
      menu.append(el('div', 'msg-menu-user', 'Add to Playlist'));
      for (const destination of destinations) item(destination.name,'plus',()=>App.musicAddToPlaylist(p.id,t,destination.id));
    }
    App.openContextMenu(menu,{x:event?.clientX,y:event?.clientY,anchor,avoidAnchor:!event?.clientX});
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  };
  App.confirmMusicDelete = function (p,t) {
    if(!canEdit(p))return;
    const prompt = p.library ? 'Delete this upload and remove it from its original playlist?' : t ? 'Remove this track from the playlist?' : 'Delete this playlist?';
    App.openModal({title:t?t.title:p.name,bodyHTML:`<p>${prompt}</p><p id="music-editor-error" class="music-editor-error" role="alert"></p>`,actionsHTML:'<button id="music-delete-confirm" class="btn danger" type="button">Delete</button>'});
    App.$('music-delete-confirm').onclick=async()=>{const b=App.$('music-delete-confirm');b.disabled=true;try{await(p.library?App.musicDeleteUpload(t):t?App.musicDeleteTrack(p.id,t.id):App.musicDeletePlaylist(p.id));App.closeModal();if(!t)App.openMusic({kind:'home'});}catch(error){b.disabled=false;setText(App.$('music-editor-error'),error.message);}};
  };
  function iconForm(record) {
    return `<div class="music-icon-editor" data-media-preview><div class="avatar-wrap"><div class="avatar-ring" style="width:132px;height:132px"><div class="avatar-clip" id="music-icon-clip"><img id="music-icon-image" alt="Icon" draggable="false"></div></div></div><div class="music-icon-fields"><input id="music-icon-file" type="file" accept="image/png,image/jpeg,image/gif" hidden><div class="row"><button type="button" class="btn tiny" id="music-icon-choose">Choose</button><button type="button" class="btn tiny" id="music-icon-default">Use Default</button></div><label class="label small" for="music-icon-zoom">Zoom</label><input id="music-icon-zoom" type="range" min="1" max="3" step="0.05" value="1"><div class="row"><button type="button" class="btn tiny" id="music-icon-center">Center</button><button type="button" class="btn tiny" id="music-icon-reset">Reset</button></div></div></div>`;
  }
  function bindIcon(record) {
    const clip=App.$('music-icon-clip'),image=App.$('music-icon-image'),file=App.$('music-icon-file'),zoom=App.$('music-icon-zoom');
    const initial=App.normalizeTransformToRel(record?.photoTransform,132),draft={photoDataURL:record?.photoDataURL||'',photoTransform:{...initial}};
    const defaultIcon='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="132" height="132" viewBox="0 0 24 24"><rect width="24" height="24" fill="#233448"/><path d="${paths.music}" fill="none" stroke="#a9c8e8" stroke-width="1.4"/></svg>`);
    const refresh=()=>{zoom.value=String(draft.photoTransform.scale||1);App.applyCroppedImage(image,draft.photoDataURL||defaultIcon,draft.photoTransform,132,132);};
    const reset=()=>{draft.photoTransform={unit:'rel',x:0,y:0,scale:1};refresh();};
    App.$('music-icon-choose').onclick=()=>file.click();
    App.$('music-icon-default').onclick=()=>{draft.photoDataURL='';reset();};
    App.$('music-icon-center').onclick=()=>{draft.photoTransform.x=0;draft.photoTransform.y=0;refresh();};App.$('music-icon-reset').onclick=reset;
    zoom.oninput=()=>{draft.photoTransform.scale=Number(zoom.value);refresh();};
    let drag;
    clip.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,start:{...draft.photoTransform}};clip.setPointerCapture(event.pointerId);};
    clip.onpointermove=event=>{if(!drag||event.pointerId!==drag.pointerId)return;const size=clip.getBoundingClientRect().width||132;draft.photoTransform.x=(drag.start.x||0)+(event.clientX-drag.x)/size;draft.photoTransform.y=(drag.start.y||0)+(event.clientY-drag.y)/size;refresh();};
    clip.onpointerup=clip.onpointercancel=()=>{drag=null;};
    file.onchange=async()=>{const chosen=file.files?.[0];file.value='';if(!chosen)return;const save=App.$('music-editor-save');if(save)save.disabled=true;try{if(!App.fileTypeOk(chosen))throw new Error('Choose a PNG, JPG, or GIF.');if(chosen.size>6*1024*1024)throw new Error('Icons must be 6 MB or smaller.');draft.photoDataURL=await App.readFileAsDataURL(chosen);reset();}catch(error){setText(App.$('music-editor-error'),error.message);}finally{if(save)save.disabled=false;}};
    refresh();return draft;
  }
  App.openMusicPlaylistEditor = function (id=null,ownerCode=App.currentUser?.code) {
    const record=id?playlist(id):null;if(id?!canEdit(record):!App.musicCanManage(ownerCode))return;
    App.openModal({title:id?'Edit Playlist':'Create Playlist',bodyHTML:`<form id="music-editor-form"><label class="label" for="music-playlist-name">Name</label><input class="input" id="music-playlist-name" required maxlength="100" autocomplete="off">${iconForm(record)}<p id="music-editor-error" class="music-editor-error" role="alert"></p></form>`,actionsHTML:`<button type="submit" form="music-editor-form" class="btn primary" id="music-editor-save">${id?'Save':'Create'}</button>`});
    App.$('music-playlist-name').value=record?.name||'';const draft=bindIcon(record);
    App.$('music-editor-form').onsubmit=async event=>{event.preventDefault();const title=App.$('music-playlist-name').value.trim();if(!title){App.$('music-playlist-name').focus();return;}const save=App.$('music-editor-save');save.disabled=true;try{if(id)await App.musicUpdatePlaylist(id,{name:title,...draft});else await App.musicCreatePlaylist({name:title,...draft},ownerCode);App.closeModal();}catch(error){save.disabled=false;setText(App.$('music-editor-error'),error.message);}};
    App.$('music-playlist-name').focus();
  };
  function pickAudio(playlistId) {
    if(!canEdit(collection(playlistId)))return;
    const input=el('input');input.type='file';input.accept='audio/*,.mp3,.mp4,.m4a,.aac,.wav,.wave,.ogg,.oga,.opus,.flac,.aif,.aiff,.wma,.webm';input.hidden=true;document.body.append(input);
    input.onchange=()=>{const file=input.files?.[0];input.remove();if(file)App.openMusicTrackEditor(playlistId,null,file);};input.addEventListener('cancel',()=>input.remove(),{once:true});input.click();
  }
  App.openMusicTrackEditor = function (playlistId,record=null,file=null) {
    if(!canEdit(collection(playlistId)))return;
    App.openModal({title:record?'Edit Track':'Upload Audio',bodyHTML:`<form id="music-editor-form">${file?`<div class="music-upload-filename">${App.escapeHtml(file.name)}</div>`:''}<label class="label" for="music-track-title">Title</label><input class="input" id="music-track-title" required maxlength="160" autocomplete="off"><label class="label" for="music-track-artist">Artist <span class="muted small">(optional)</span></label><input class="input" id="music-track-artist" maxlength="160" autocomplete="off"><label class="label" for="music-track-album">Album <span class="muted small">(optional)</span></label><input class="input" id="music-track-album" maxlength="160" autocomplete="off">${iconForm(record)}<progress id="music-upload-progress" value="0" max="100" hidden></progress><p id="music-upload-status" class="muted small" role="status"></p><p id="music-editor-error" class="music-editor-error" role="alert"></p></form>`,actionsHTML:`<button type="submit" form="music-editor-form" id="music-editor-save" class="btn primary">${record?'Save':'Upload'}</button>`});
    for(const key of ['title','artist','album'])App.$('music-track-'+key).value=record?.[key]||'';const draft=bindIcon(record);
    App.$('music-editor-form').onsubmit=async event=>{
      event.preventDefault();const metadata={...draft};for(const key of ['title','artist','album'])metadata[key]=App.$('music-track-'+key).value.trim();if(!metadata.title){App.$('music-track-title').focus();return;}
      const save=App.$('music-editor-save'),error=App.$('music-editor-error'),progress=App.$('music-upload-progress'),status=App.$('music-upload-status');save.disabled=true;setText(error,'');
      App.modalEl.dataset.busy='1';App.modalEl.setAttribute('aria-busy','true');
      try {
        if(record)await(App.musicLibraryOwner(playlistId)?App.musicEditUpload(record,metadata):App.musicUpdateTrack(playlistId,record.id,metadata));
        else {progress.hidden=false;setText(status,'Uploading…');await App.musicUploadTrack(playlistId,file,metadata,value=>{const percent=typeof value==='number'?value:Number(value?.percent||0);progress.value=Math.max(0,Math.min(100,percent));setText(status,`Uploading ${Math.round(progress.value)}%`);});}
        delete App.modalEl.dataset.busy;App.modalEl.setAttribute('aria-busy','false');App.closeModal();
      } catch(failure){delete App.modalEl.dataset.busy;App.modalEl.setAttribute('aria-busy','false');save.disabled=false;setText(error,failure.message||'Upload failed.');setText(status,'');}
    };App.$('music-track-title').focus();
  };
  App.openMusic = function (view={kind:'home'}) {
    if(!App.currentUser)return;
    if(typeof view==='string')view={kind:'playlist',id:view};
    if(!['home','all','user','playlist'].includes(view?.kind))view={kind:'home'};
    App.musicView={...view};App.musicScreenOpen=true;App.$('music-screen').hidden=false;App.$('btn-music').classList.add('is-selected');App.$('btn-music').setAttribute('aria-expanded','true');
    App.closeMobileDrawers?.();App.closeUserProfile?.(true);App.closeContextMenu?.(App.$('music-context-menu'),{immediate:true});
    run(App.musicSubscribe?.());if(view.kind==='playlist')run(App.musicWatchPlaylist?.(view.id));
    App.renderMusic();App.renderMusicPlayer?.();App.$('music-close').focus({preventScroll:true});
  };
  App.closeMusic = function () {
    App.musicScreenOpen=false;if(App.$('music-screen'))App.$('music-screen').hidden=true;
    App.$('btn-music')?.classList.remove('is-selected');App.$('btn-music')?.setAttribute('aria-expanded','false');App.closeContextMenu?.(App.$('music-context-menu'),{immediate:true});App.renderMusicPlayer?.();App.$('btn-music')?.focus({preventScroll:true});
  };
  App.register('music/ui',function(){
    const launcher=button('Music','music',()=>App.openMusic(),'sidebar-dock-button');
    launcher.id='btn-music';
    launcher.setAttribute('aria-controls','music-screen');
    launcher.setAttribute('aria-expanded','false');
    launcher.innerHTML=`<span class="side-ico" aria-hidden="true">${svg('music')}</span>`;
    App.$('btn-side-settings').before(launcher);
    const screen=el('section','music-screen');screen.id='music-screen';screen.hidden=true;screen.setAttribute('aria-label','Music');
    const header=el('header','music-screen-header');const back=button('Back','back',()=>App.openMusic());back.id='music-back';header.append(back,el('div','music-screen-title','Music'));const close=button('Close Music','close',App.closeMusic);close.id='music-close';header.append(close);
    const content=el('main','music-content');content.id='music-content';const footer=el('div');footer.id='music-player-host';screen.append(header,content,footer);document.body.append(screen);
    const jamConfirmOpen = () => !!document.querySelector('#poll-popover:not([hidden]):not(.closing) [data-jam-confirm]');
    document.addEventListener('pointerdown',event=>{const menu=App.$('music-context-menu');if(menu&&!menu.hidden&&!menu.contains(event.target))App.closeContextMenu(menu,{immediate:true});});
    document.addEventListener('keydown',event=>{
      if(jamConfirmOpen())return;
      const menu=App.$('music-context-menu');
      if(menu&&!menu.hidden){
        if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();App.closeContextMenu(menu,{immediate:true});}
        else if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);buttons[(i+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}
        return;
      }
      if(event.key==='Escape'&&App.musicScreenOpen&&App.modalEl?.hidden){event.preventDefault();App.closeMusic();}
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key!=='Tab'||!App.musicScreenOpen||jamConfirmOpen()||!App.modalEl?.hidden||!App.$('music-context-menu')?.hidden&&App.$('music-context-menu'))return;
      const controls=[...screen.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length&&!node.closest('[hidden]'));
      const first=controls[0],last=controls.at(-1),active=document.activeElement;
      if(!screen.contains(active)||event.shiftKey&&active===first||!event.shiftKey&&active===last){event.preventDefault();(event.shiftKey?last:first)?.focus({preventScroll:true});}
    });
    window.addEventListener('blur',()=>App.closeContextMenu?.(App.$('music-context-menu'),{immediate:true}));
    setInterval(()=>{if(!App.musicScreenOpen)return;for(const row of App.$('music-screen').querySelectorAll('.music-track-row[data-added-at]')){const value=ago(row.dataset.addedAt);setText(row.querySelector('.music-added-column'),value);setText(row.querySelector('.music-compact-added'),value);}},1000);
  });
})(globalThis.ChatApp);
