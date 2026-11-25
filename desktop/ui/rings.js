'use strict';
const cards = new Map(), host = document.getElementById('rings');
const isPing = window.ringPopup.mode === 'pings';
let earlierOpen = false;
const earlierHost = document.createElement('section'), earlierButton = document.createElement('button'), earlierList = document.createElement('div');
if (isPing) {
  earlierHost.className = 'earlier-mentions'; earlierButton.className = 'earlier-button'; earlierButton.type = 'button'; earlierList.className = 'earlier-list'; earlierList.hidden = true;
  earlierButton.setAttribute('aria-expanded', 'false'); earlierButton.setAttribute('aria-controls', 'earlier-list'); earlierList.id = 'earlier-list';
  earlierButton.addEventListener('click', () => { earlierOpen = !earlierOpen; earlierList.hidden = !earlierOpen; earlierButton.setAttribute('aria-expanded', String(earlierOpen)); host.classList.toggle('earlier-open', earlierOpen); });
  earlierHost.append(earlierButton, earlierList); earlierHost.hidden = true; host.append(earlierHost);
}
if (isPing) { document.body.classList.add('ping-mode'); host.setAttribute('aria-label', 'Mentions'); document.title = 'Chat App Pings'; }
const PHONE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.2 12.2c5.4-5.2 14.2-5.2 19.6 0a1.3 1.3 0 0 1 0 1.8l-2 2a1.2 1.2 0 0 1-1.7 0l-2.5-2.3a1.2 1.2 0 0 1-.3-1.2l.3-1a12.2 12.2 0 0 0-7.2 0l.3 1a1.2 1.2 0 0 1-.3 1.2L5.9 16a1.2 1.2 0 0 1-1.7 0l-2-2a1.3 1.3 0 0 1 0-1.8Z"/></svg>';
const JOIN_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.79a2 2 0 0 1-.45 2.11L8.09 9.88a16 16 0 0 0 6 6l1.26-1.26a2 2 0 0 1 2.11-.45c.9.33 1.83.56 2.79.69A2 2 0 0 1 22 16.92Z"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const isControls = window.ringPopup.mode === 'controls';
if (!isPing) {
  document.title = isControls ? 'Chat App Call Buttons' : 'Chat App Incoming Calls';
  host.className = isControls ? 'ring-actions-surface' : 'ring-visual-surface';
  const nodes = new Map();
  const pager = document.createElement('div'); pager.className = 'ring-pager'; host.append(pager);
  window.ringPopup.onHover(id => {
    for (const [key, node] of nodes) node.root.classList.toggle('pointer-through', key === id);
  });
  function place(element, rect) {
    Object.assign(element.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' });
  }
  window.ringPopup.onState(({ rings, layout, revision }) => {
    if (!layout) return;
    const wanted = new Set(rings.map(ring => ring.id));
    for (const [id, node] of nodes) if (!wanted.has(id)) {
      node.root.remove(); nodes.delete(id);
    }
    for (const [i, ring] of rings.entries()) {
      let node = nodes.get(ring.id);
      if (!node) {
        const root = document.createElement('section');
        root.className = isControls ? 'action-row' : 'call-card';
        node = { root, source:null }; nodes.set(ring.id,node); host.append(root);
        if (isControls) {
          for (const [action, title, icon] of [['decline','Decline Call',PHONE],['join','Join Call',JOIN_PHONE]]) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'control ' + action;
            button.title = title; button.setAttribute('aria-label',title); button.innerHTML = icon;
            button.onclick = async () => {
              if (root.dataset.answering) return; root.dataset.answering = action;
              try { await window.ringPopup.command({ action, id:ring.id, roomId:ring.roomId }); }
              finally { delete root.dataset.answering; }
            };
            root.append(button);
          }
        } else {
          const icon = document.createElement('div'); icon.className = 'room-icon';
          const copy = document.createElement('div'); copy.className = 'call-copy';
          const label = document.createElement('div'); label.className = 'call-label'; label.textContent = 'Incoming call';
          const name = document.createElement('div'); name.className = 'name'; copy.append(label,name); root.append(icon,copy);
          Object.assign(node,{icon,name});
        }
      }
      node.root.classList.remove('pointer-through');
      if (isControls) for (const [j, button] of [...node.root.children].entries()) place(button,layout.controls[2*i+j]);
      else {
        place(node.root,{ x:4, y:4+i*layout.step, width:layout.bounds.width-8, height:layout.step-8 });
        node.name.textContent = ring.roomName;
        if (node.source !== ring.roomIcon) {
          node.source = ring.roomIcon;
          if (node.source) { const image = new Image(); image.alt=''; image.decoding='async'; image.src=node.source; node.icon.replaceChildren(image); }
          else node.icon.replaceChildren();
        }
        if (node.icon.firstElementChild) {
          const t=ring.roomIconTransform || {};
          node.icon.firstElementChild.style.transform = 'translate('+((t.x||0)*100)+'%,'+((t.y||0)*100)+'%) scale('+(t.scale||1)+')';
        } else node.icon.textContent=ring.roomName.slice(0,1).toUpperCase();
      }
    }
    pager.replaceChildren(); pager.hidden = layout.pages < 2;
    if (layout.pages > 1) {
      if (isControls) {
        for (const [i, delta] of [-1,1].entries()) {
          const button=document.createElement('button'); button.type='button'; button.className='page-call';
          button.textContent=delta < 0 ? '‹' : '›'; button.setAttribute('aria-label',delta<0?'Previous calls':'Next calls');
          button.disabled=layout.page+delta<0 || layout.page+delta>=layout.pages;
          place(button,layout.controls[2*rings.length+i]); button.onclick=()=>window.ringPopup.command({action:'page',delta,revision});
          pager.append(button);
        }
      } else {
        pager.textContent = 'Calls '+(layout.page+1)+' of '+layout.pages;
        place(pager,{x:4,y:rings.length*layout.step+1,width:layout.bounds.width-8,height:30});
      }
    }
    if (isControls) window.ringPopup.painted(revision);
  });
}
if (isPing) window.ringPopup.onState(state => {
  if (isPing) {
    const earlier = state.earlier || []; earlierHost.hidden = !earlier.length;
    earlierButton.textContent = `+${earlier.length} earlier mention${earlier.length === 1 ? '' : 's'}`;
    earlierList.replaceChildren(...[...earlier].reverse().map(ping => {
      const row = document.createElement('div'); row.className = 'earlier-row';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'earlier-open-message';
      const title = document.createElement('strong'); title.textContent = `${ping.roomName} · ${ping.username}`;
      const preview = document.createElement('span'); preview.textContent = ping.doNotDisturb ? 'Mention' : ping.preview || 'Mention'; open.append(title, preview);
      open.addEventListener('click', () => { void window.ringPopup.command({ action: 'open', id: ping.id, roomId: ping.roomId, messageKey: ping.messageKey }); });
      const dismiss = document.createElement('button'); dismiss.className = 'earlier-dismiss'; dismiss.type = 'button'; dismiss.innerHTML = CLOSE; dismiss.setAttribute('aria-label', `Dismiss mention from ${ping.username}`);
      dismiss.addEventListener('click', () => { void window.ringPopup.command({ action: 'dismiss', id: ping.id, roomId: ping.roomId, messageKey: ping.messageKey }); });
      row.append(open, dismiss); return row;
    }));
    if (!earlier.length) { earlierOpen = false; earlierList.hidden = true; earlierButton.setAttribute('aria-expanded', 'false'); host.classList.remove('earlier-open'); }
  }
  const rings = (isPing ? state.pings : state.rings) || [];
  const wanted = new Set(rings.map(ring => ring.id));
  for (const [id, card] of cards) if (!wanted.has(id) && !card.leaving) {
    card.leaving = true; card.root.classList.add('leaving');
    card.timer = setTimeout(() => { if (card.leaving) { card.root.remove(); cards.delete(id); } }, 200);
  }
  for (const ring of rings) {
    let card = cards.get(ring.id);
    if (!card) {
      const root = document.createElement('section'); root.className = isPing ? 'ring ping' : 'ring';
      const name = document.createElement('div'); name.className = 'name';
      const icon = document.createElement('div'); icon.className = 'room-icon';
      const controls = document.createElement('div'); controls.className = 'controls';
      const copy = document.createElement('div'); copy.className = 'ping-copy';
      const username = document.createElement('div'); username.className = 'ping-user';
      const preview = document.createElement('div'); preview.className = 'ping-preview';
      const answer = async action => {
        if (card?.leaving || root.dataset.answering) return;
        root.dataset.answering = action;
        try { await window.ringPopup.command({ action, id: ring.id, roomId: ring.roomId, messageKey: ring.messageKey }); }
        finally { delete root.dataset.answering; }
      };
      if (isPing) {
        root.tabIndex = 0; root.setAttribute('role', 'button');
        root.addEventListener('click', () => { void answer('open').catch(() => {}); });
        root.addEventListener('keydown', event => { if (event.target === root && ['Enter', ' '].includes(event.key)) { event.preventDefault(); void answer('open').catch(() => {}); } });
        const close = document.createElement('button'); close.type = 'button'; close.className = 'ping-close'; close.setAttribute('aria-label', 'Dismiss notification'); close.title = 'Dismiss notification'; close.innerHTML = CLOSE;
        close.addEventListener('click', event => { event.stopPropagation(); void answer('dismiss').catch(() => {}); });
        copy.append(name, username, preview); root.append(icon, copy, close);
      }
      host.appendChild(root); card = { root, name, icon, username, preview }; cards.set(ring.id, card);
    }
    clearTimeout(card.timer); card.leaving = false; card.root.classList.remove('leaving');
    card.name.textContent = ring.roomName; card.name.title = ring.roomName;
    if (isPing) { card.username.textContent = `${ring.username} pinged you`; card.preview.textContent = ring.doNotDisturb ? '' : ring.preview; card.preview.hidden = !card.preview.textContent; card.root.setAttribute('aria-label', `${ring.roomName}: ${ring.username} pinged you`); }
    if (card.image !== ring.roomIcon) {
      card.image = ring.roomIcon; card.icon.replaceChildren();
      if (ring.roomIcon) { const image = document.createElement('img'); image.alt = ''; image.src = ring.roomIcon; card.icon.appendChild(image); } else card.icon.textContent = ring.roomName.slice(0, 1).toUpperCase();
    }
    const image = card.icon.querySelector('img'), transform = ring.roomIconTransform || {};
    if (image) image.style.transform = `translate(${(transform.x || 0) * 100}%, ${(transform.y || 0) * 100}%) scale(${transform.scale || 1})`;
  }
});
