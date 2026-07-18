var l=n=>n?String(n).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):"",k=n=>{if(!n||n==="unknown")return"unknown";if(n.includes("T"))try{return new Date(n).toLocaleDateString()}catch{return n}return n},E=n=>{let e=n.status||"unknown",o=e==="approved"?"badge-ok":"badge-pending",r=n.date||n.createdAt||"unknown",i=k(r),a=n.text||n.content||"",c=[n.source?.kind&&`kind=${n.source.kind}`,n.source?.identifier&&`identifier=${n.source.identifier}`,n.source?.id&&`id=${n.source.id}`,n.source?.note].filter(Boolean).join("; "),s=n.provenance?.path||c,u=n.provenance?.lineStart?`:${n.provenance.lineStart}`:"";return`
    <div class="card">
      <div class="card-header">
        <div class="header-left">
          <span class="badge ${o}">${e.toUpperCase()}</span>
          ${n.scope?`<span class="scope-tag">${l(n.scope)}</span>`:""}
          ${n.type?`<span class="type-tag">${l(n.type)}</span>`:""}
        </div>
        <span class="card-date">${l(i)}</span>
      </div>

      <div class="memory-text">${l(a)}</div>

      ${s||n.section?`
        <div class="provenance-section">
          ${n.section?`
            <div class="provenance-row">
              <span class="provenance-label">Section:</span>
              <span class="provenance-value">${l(n.section)}</span>
            </div>
          `:""}
          ${s?`
            <div class="provenance-row">
              <span class="provenance-label">Provenance:</span>
              <span class="provenance-code">${l(s)}${l(u)}</span>
            </div>
          `:""}
        </div>
      `:""}
    </div>
  `},D=n=>{let e=n.status||"candidate",t=l(String(e).toUpperCase()),r=e==="approved"?"badge-ok":"badge-pending",i=n.createdAt||n.date||"unknown",a=k(i),c=n.content||n.text||"",s=[n.source?.kind&&`kind=${n.source.kind}`,n.source?.identifier&&`identifier=${n.source.identifier}`,n.source?.id&&`id=${n.source.id}`,n.source?.note].filter(Boolean).join("; "),u=n.provenance?.path||s,d=n.provenance?.lineStart?`:${n.provenance.lineStart}`:"",p="";if(n.idempotencyKey&&(p+=`
      <div class="provenance-row">
        <span class="provenance-label">Idempotency Key:</span>
        <span class="provenance-code">${l(n.idempotencyKey)}</span>
      </div>
    `),n.review){let h=n.review.note?`; note=${n.review.note}`:"";p+=`
      <div class="provenance-row">
        <span class="provenance-label">Review:</span>
        <span class="provenance-value">${l(n.review.status||n.review.action||"unknown")}${l(h)}</span>
      </div>
    `}return`
    <div class="card">
      <div class="card-header">
        <div class="header-left">
          <span class="badge ${r}">${t}</span>
          ${n.scope?`<span class="scope-tag">${l(n.scope)}</span>`:""}
          ${n.type?`<span class="type-tag">${l(n.type)}</span>`:""}
        </div>
        <span class="card-date">${l(a)}</span>
      </div>

      <div class="memory-text">${l(c)}</div>

      <div class="provenance-section">
        ${n.issueId?`
          <div class="provenance-row">
            <span class="provenance-label">Issue ID:</span>
            <span class="provenance-value" style="font-weight: 600;">${l(n.issueId)}</span>
          </div>
        `:""}
        ${u?`
          <div class="provenance-row">
            <span class="provenance-label">Provenance:</span>
            <span class="provenance-code">${l(u)}${l(d)}</span>
          </div>
        `:""}
        ${p}
      </div>
    </div>
  `},f=(n,e,t)=>!e||e.length===0?`
      <div class="section-container">
        <h3 class="section-title">
          <span>${l(n)}</span>
          <span class="counter-badge">0</span>
        </h3>
        <div class="empty-section-banner">
          No ${l(t.toLowerCase())} memories found.
        </div>
      </div>
    `:`
    <div class="section-container">
      <h3 class="section-title">
        <span>${l(n)}</span>
        <span class="counter-badge">${e.length}</span>
      </h3>
      <div class="cards-grid">
        ${e.map(o=>E(o)).join("")}
      </div>
    </div>
  `,y=`
  :host {
    display: block;
    font-family: system-ui, -apple-system, sans-serif;
    color: rgba(255, 255, 255, 0.9);
    max-width: 960px;
    margin: 0 auto;
    padding: 24px;
  }

  .header {
    margin-bottom: 28px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 16px;
  }

  .header-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 4px 0;
    color: #fff;
  }

  .header-subtitle {
    margin: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
  }

  /* Loading state */
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    gap: 16px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #818cf8;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-text {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Error state */
  .error-container {
    padding: 24px;
    border-radius: 12px;
    border: 1px solid rgba(239, 68, 68, 0.2);
    background-color: rgba(239, 68, 68, 0.05);
    color: #ef4444;
  }

  .error-title {
    margin: 0 0 8px 0;
    font-weight: 600;
    font-size: 16px;
  }

  .error-body {
    margin: 0;
    font-size: 14px;
    opacity: 0.8;
  }

  /* Empty state */
  .empty-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    padding: 32px;
    border: 1px dashed rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    text-align: center;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 8px;
  }

  .empty-desc {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    max-width: 360px;
    line-height: 1.5;
  }

  /* Section styles */
  .section-container {
    margin-bottom: 32px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .counter-badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 12px;
    background-color: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  .empty-section-banner {
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.02);
    color: rgba(255, 255, 255, 0.4);
    font-size: 13px;
  }

  .cards-grid {
    display: grid;
    gap: 16px;
  }

  /* Card styles */
  .card {
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    background-color: rgba(255, 255, 255, 0.03);
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.2s ease, background-color 0.2s ease;
  }

  .card:hover {
    border-color: rgba(255, 255, 255, 0.15);
    background-color: rgba(255, 255, 255, 0.05);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.05em;
  }

  .badge-ok {
    background-color: rgba(34, 197, 94, 0.1);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.2);
  }

  .badge-pending {
    background-color: rgba(234, 179, 8, 0.1);
    color: #facc15;
    border: 1px solid rgba(234, 179, 8, 0.2);
  }

  .scope-tag {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #a78bfa;
    font-weight: 600;
  }

  .type-tag {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.4);
  }

  .card-date {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  .memory-text {
    white-space: pre-wrap;
    word-break: break-word;
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    line-height: 1.6;
  }

  .provenance-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  .provenance-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .provenance-label {
    color: rgba(255, 255, 255, 0.25);
  }

  .provenance-value {
    color: rgba(255, 255, 255, 0.6);
  }

  .provenance-code {
    font-family: monospace;
    color: #818cf8;
    background-color: rgba(129, 140, 248, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    word-break: break-all;
  }

  /* The local SPS instance uses a light canvas by default. */
  :host { color: #172033; }
  .header { border-bottom-color: #e2e8f0; }
  .header-title, .section-title { color: #172033; }
  .header-subtitle, .loading-text, .card-date { color: #64748b; }
  .empty-container, .empty-section-banner, .card { border-color: #dbe3ec; background-color: #ffffff; }
  .empty-title { color: #172033; }
  .empty-desc, .empty-section-banner { color: #64748b; }
  .counter-badge { background-color: #eef2f7; color: #475569; }
  .card:hover { border-color: #cbd5e1; background-color: #f8fafc; }
  .scope-tag { color: #6d28d9; }
  .type-tag { color: #64748b; }
  .memory-text { color: #1f2937; }
  .provenance-section { border-top-color: #e2e8f0; color: #64748b; }
  .provenance-label { color: #94a3b8; }
  .provenance-value { color: #475569; }
  .provenance-code { color: #4338ca; background-color: #eef2ff; }
`,x=class extends HTMLElement{constructor(){super(),this.attachShadow({mode:"open"}),this._pluginSlot=null,this._pluginContext=null,this._mounted=!1,this._loading=!1,this._error=null,this._data=null,this._lastCacheKey=null}get pluginSlot(){return this._pluginSlot}set pluginSlot(e){this._pluginSlot=e,this._fetchData()}get pluginContext(){return this._pluginContext}set pluginContext(e){this._pluginContext=e,this._fetchData()}connectedCallback(){this._mounted=!0,this._fetchData()}disconnectedCallback(){this._mounted=!1}async _fetchData(){if(!this._mounted)return;let e=this._pluginContext,t=this._pluginSlot;if(!e)return;let o=e.companyId,r=e.entityId,i=e.projectId;if(!o||!r)return;let a=`${o}:${i}:${r}`;if(!(this._lastCacheKey===a&&(this._loading||this._data||this._error))){this._lastCacheKey=a,this._loading=!0,this._error=null,this._data=null,this._render();try{let s=`/api/plugins/${t?.pluginId||"local.memory-sidecar"}/data/memory-view`,u=await fetch(s,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:o,params:{companyId:o,projectId:i||null,issueId:r}})});if(!u.ok){let p=`HTTP ${u.status}`;try{let h=await u.json();p=h.message||h.error||p}catch{}throw new Error(p)}let d=await u.json();this._data=d.data||{},this._loading=!1,this._render()}catch(c){this._error=c,this._loading=!1,this._render()}}}_render(){let e=this.shadowRoot;if(!e)return;let t="";if(this._loading)t=`
        <div class="loading-container">
          <div class="spinner"></div>
          <span class="loading-text">Recalling task room memory...</span>
        </div>
      `;else if(this._error)t=`
        <div class="error-container">
          <h4 class="error-title">Failed to load memory data</h4>
          <p class="error-body">${l(this._error.message||String(this._error))}</p>
        </div>
      `;else if(this._data){let o=this._data.companyMemories||[],r=this._data.projectMemories||[],i=this._data.candidates||[],a=!!this._data.hasAssignee,c=this._data.agentMemories||[];o.length===0&&r.length===0&&i.length===0&&(!a||c.length===0)?t=`
          <div class="empty-container">
            <span class="empty-title">No Memory Found</span>
            <span class="empty-desc">
              There is no approved company/project memory or proposed candidates associated with this task room yet.
            </span>
          </div>
        `:t=`
          ${f("Memory Candidates",i,"Candidate")}
          ${a?f("Assigned Agent Memory",c,"Agent"):""}
          ${f("Project Memory",r,"Project")}
          ${f("Company Memory",o,"Company")}
        `}else t=`
        <div class="loading-container">
          <span class="loading-text">Initializing context...</span>
        </div>
      `;e.innerHTML=`
      <style>${y}</style>

      <div class="header">
        <h2 class="header-title">Task Room Memory</h2>
        <p class="header-subtitle">Read-only view of memory items and proposed candidates.</p>
      </div>

      <div class="content-body">
        ${t}
      </div>
    `}};customElements.get("paperclip-memory-tab")||customElements.define("paperclip-memory-tab",x);var L="paperclip-memory-tab",_=class extends HTMLElement{constructor(){super(),this.attachShadow({mode:"open"}),this._pluginSlot=null,this._pluginContext=null,this._mounted=!1,this._loading=!1,this._error=null,this._data=null,this._lastCacheKey=null}get pluginSlot(){return this._pluginSlot}set pluginSlot(e){this._pluginSlot=e,this._fetchData()}get pluginContext(){return this._pluginContext}set pluginContext(e){this._pluginContext=e,this._fetchData()}connectedCallback(){this._mounted=!0,this._fetchData()}disconnectedCallback(){this._mounted=!1}async _fetchData(){if(!this._mounted)return;let e=this._pluginContext,t=this._pluginSlot;if(!e)return;let o=e.companyId,r=e.projectId||e.entityId;if(!o||!r){this._error=new Error("companyId and projectId are required for project-memory-view data"),this._loading=!1,this._render();return}let i=`${o}:${r}`;if(!(this._lastCacheKey===i&&(this._loading||this._data||this._error))){this._lastCacheKey=i,this._loading=!0,this._error=null,this._data=null,this._render();try{let c=`/api/plugins/${t?.pluginId||"local.memory-sidecar"}/data/project-memory-view`,s=await fetch(c,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:o,params:{companyId:o,projectId:r}})});if(!s.ok){let d=`HTTP ${s.status}`;try{let p=await s.json();d=p.message||p.error||d}catch{}throw new Error(d)}let u=await s.json();this._data=u.data||{},this._loading=!1,this._render()}catch(a){this._error=a,this._loading=!1,this._render()}}}_render(){let e=this.shadowRoot;if(!e)return;let t="";if(this._loading)t=`
        <div class="loading-container">
          <div class="spinner"></div>
          <span class="loading-text">Recalling project memory...</span>
        </div>
      `;else if(this._error)t=`
        <div class="error-container">
          <h4 class="error-title">Failed to load memory data</h4>
          <p class="error-body">${l(this._error.message||String(this._error))}</p>
        </div>
      `;else if(this._data){let o=this._data.companyMemories||[],r=this._data.projectMemories||[],i=this._data.candidates||[];o.length===0&&r.length===0&&i.length===0?t=`
          <div class="empty-container">
            <span class="empty-title">No Memory Found</span>
            <span class="empty-desc">
              There is no approved company/project memory or proposed candidates associated with this project yet.
            </span>
          </div>
        `:t=`
          ${f("Memory Candidates",i,"Candidate")}
          ${f("Project Memory",r,"Project")}
          ${f("Company Memory",o,"Company")}
        `}else t=`
        <div class="loading-container">
          <span class="loading-text">Initializing context...</span>
        </div>
      `;e.innerHTML=`
      <style>${y}</style>

      <div class="header">
        <h2 class="header-title">Project Hub Memory</h2>
        <p class="header-subtitle">Read-only view of memory items and proposed candidates for this project.</p>
      </div>

      <div class="content-body">
        ${t}
      </div>
    `}};customElements.get("paperclip-project-memory-tab")||customElements.define("paperclip-project-memory-tab",_);var M="paperclip-project-memory-tab",w=class extends HTMLElement{constructor(){super(),this.attachShadow({mode:"open"}),this._pluginSlot=null,this._pluginContext=null,this._mounted=!1,this._loading=!1,this._error=null,this._data=null,this._lastCacheKey=null}get pluginSlot(){return this._pluginSlot}set pluginSlot(e){this._pluginSlot=e,this._fetchData()}get pluginContext(){return this._pluginContext}set pluginContext(e){this._pluginContext=e,this._fetchData()}connectedCallback(){this._mounted=!0,this._fetchData()}disconnectedCallback(){this._mounted=!1}async _fetchData(){if(!this._mounted)return;let e=this._pluginContext,t=this._pluginSlot;if(!e)return;let o=e.companyId,r=e.projectId||e.entityId;if(!o||!r){this._error=new Error("companyId and projectId are required for project-memory-candidates-view data"),this._loading=!1,this._render();return}let i=`${o}:${r}`;if(!(this._lastCacheKey===i&&(this._loading||this._data||this._error))){this._lastCacheKey=i,this._loading=!0,this._error=null,this._data=null,this._render();try{let c=`/api/plugins/${t?.pluginId||"local.memory-sidecar"}/data/project-memory-candidates-view`,s=await fetch(c,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:o,params:{companyId:o,projectId:r}})});if(!s.ok){let d=`HTTP ${s.status}`;try{let p=await s.json();d=p.message||p.error||d}catch{}throw new Error(d)}let u=await s.json();this._data=u.data||{},this._loading=!1,this._render()}catch(a){this._error=a,this._loading=!1,this._render()}}}_render(){let e=this.shadowRoot;if(!e)return;let t="";if(this._loading)t=`
        <div class="loading-container">
          <div class="spinner"></div>
          <span class="loading-text">Loading memory candidates...</span>
        </div>
      `;else if(this._error)t=`
        <div class="error-container">
          <h4 class="error-title">Failed to load memory candidates</h4>
          <p class="error-body">${l(this._error.message||String(this._error))}</p>
        </div>
      `;else if(this._data){let o=this._data.candidates||[];o.length===0?t=`
          <div class="empty-container">
            <span class="empty-title">No Proposed Candidates</span>
            <span class="empty-desc">
              There are no memory candidates proposed for this project yet.
            </span>
          </div>
        `:t=`
          <div class="section-container">
            <h3 class="section-title">
              <span>Memory Candidates Queue</span>
              <span class="counter-badge">${o.length}</span>
            </h3>
            <div class="cards-grid">
              ${o.map(r=>D(r)).join("")}
            </div>
          </div>
        `}else t=`
        <div class="loading-container">
          <span class="loading-text">Initializing context...</span>
        </div>
      `;e.innerHTML=`
      <style>${y}</style>

      <div class="header">
        <h2 class="header-title">Project Memory Candidates</h2>
        <p class="header-subtitle">Read-only queue of proposed memory candidates for CTO review.</p>
      </div>

      <div class="content-body">
        ${t}
      </div>
    `}};customElements.get("paperclip-project-memory-candidates-tab")||customElements.define("paperclip-project-memory-candidates-tab",w);var z="paperclip-project-memory-candidates-tab",$=class extends HTMLElement{constructor(){super(),this.attachShadow({mode:"open"}),this._pluginSlot=null,this._pluginContext=null,this._mounted=!1,this._submitting=!1,this._previewData=null,this._error=null,this._launching=!1,this._launchResult=null,this._launchError=null,this._currentDraft=null,this._agentRooms=[],this._agentRoomsLoading=!1,this._agentRoomsKey=null}get pluginSlot(){return this._pluginSlot}set pluginSlot(e){this._pluginSlot=e}get pluginContext(){return this._pluginContext}set pluginContext(e){this._pluginContext=e,this._render(),this._loadAgentRooms()}connectedCallback(){this._mounted=!0,this._render(),this._loadAgentRooms()}disconnectedCallback(){this._mounted=!1}async _loadAgentRooms(){let e=this._pluginContext,t=e?.projectId||e?.entityId,o=e?.companyId,r=this._pluginSlot?.pluginId||"local.memory-sidecar";if(!o||!t||this._agentRoomsLoading)return;let i=`${o}:${t}:${r}`;if(this._agentRoomsKey!==i){this._agentRoomsLoading=!0;try{let a=await fetch(`/api/plugins/${r}/data/direct-task-agent-rooms`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:o,params:{companyId:o,projectId:t}})});if(!a.ok)throw new Error("Unable to load Agent Rooms.");let c=await a.json();this._agentRooms=Array.isArray(c?.data?.agentRooms)?c.data.agentRooms:[],this._agentRoomsKey=i}catch{this._agentRooms=[],this._agentRoomsKey=i}finally{this._agentRoomsLoading=!1,this._updateAgentRoomOptions()}}}_updateAgentRoomOptions(){let e=this.shadowRoot,t=e?.getElementById("role-select"),o=e?.getElementById("agent-room-select");if(!t||!o)return;let r=o.value,i=t.value,a=this._agentRooms.filter(s=>s.role===i),c=this._agentRoomsLoading?"Loading Agent Rooms...":i?"Select an Agent Room...":"Select a worker role first...";o.innerHTML=`<option value="" disabled selected>${l(c)}</option>${a.map(s=>`<option value="${l(s.id)}">${l(s.identifier)} - ${l(s.title)}</option>`).join("")}`,a.some(s=>s.id===r)&&(o.value=r),o.disabled=this._agentRoomsLoading||!i||a.length===0}_setupFormListeners(){let e=this.shadowRoot;if(!e)return;let t=e.getElementById("preview-form");t&&t.addEventListener("submit",async o=>{if(o.preventDefault(),this._submitting)return;let r=e.getElementById("role-select"),i=e.getElementById("agent-room-select"),a=e.getElementById("title-input"),c=e.getElementById("description-input"),s=r.value,u=i.value,d=a.value.trim(),p=c.value.trim();e.getElementById("error-role").textContent="",e.getElementById("error-agent-room").textContent="",e.getElementById("error-title").textContent="",e.getElementById("error-description").textContent="";let h=!0;if(s?s!=="unreal-code"&&s!=="unreal-qa"&&(e.getElementById("error-role").textContent="Invalid role selected.",h=!1):(e.getElementById("error-role").textContent="Role selection is required.",h=!1),u||(e.getElementById("error-agent-room").textContent="Agent Room selection is required.",h=!1),d?d.length>200&&(e.getElementById("error-title").textContent=`Title must be 200 characters or less (current: ${d.length}).`,h=!1):(e.getElementById("error-title").textContent="Title is required.",h=!1),p?p.length>4e3&&(e.getElementById("error-description").textContent=`Description must be 4,000 characters or less (current: ${p.length}).`,h=!1):(e.getElementById("error-description").textContent="Description is required.",h=!1),!!h){this._submitting=!0,this._error=null,this._previewData=null,this._updateButtonState();try{let m=this._pluginContext,C=this._pluginSlot;if(!m)throw new Error("Plugin context not initialized");let I=m.companyId,S=m.projectId||m.entityId,R=`/api/plugins/${C?.pluginId||"local.memory-sidecar"}/data/direct-task-preview`,b=await fetch(R,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:I,params:{companyId:I,projectId:S,role:s,parentId:u,title:d,description:p}})});if(!b.ok){let g=`HTTP ${b.status}`;try{let v=await b.json();g=v.message||v.error||g}catch{}throw new Error(g)}let j=await b.json();if(this._previewData=j.data||{},this._previewData.valid)this._currentDraft={role:s,parentId:u,title:d,description:p,idempotencyKey:"idem-"+Math.random().toString(36).substring(2,15)+Math.random().toString(36).substring(2,15)},this._launchResult=null,this._launchError=null;else{this._currentDraft=null;let g=this._previewData.errors;g&&(g.role&&(e.getElementById("error-role").textContent=g.role),g.title&&(e.getElementById("error-title").textContent=g.title),g.description&&(e.getElementById("error-description").textContent=g.description))}}catch(m){this._error=m}finally{this._submitting=!1,this._updateButtonState(),this._renderPreviewResult()}}})}_setupFormChangeListeners(){let e=this.shadowRoot;if(!e)return;let t=e.getElementById("role-select"),o=e.getElementById("agent-room-select"),r=e.getElementById("title-input"),i=e.getElementById("description-input"),a=()=>{this._currentDraft&&(t.value!==this._currentDraft.role||o.value!==this._currentDraft.parentId||r.value.trim()!==this._currentDraft.title||i.value.trim()!==this._currentDraft.description)&&(this._previewData=null,this._currentDraft=null,this._launchResult=null,this._launchError=null,this._renderPreviewResult())};t&&t.addEventListener("change",()=>{this._updateAgentRoomOptions(),a()}),o&&o.addEventListener("change",a),r&&r.addEventListener("input",a),i&&i.addEventListener("input",a)}_updateButtonState(){let e=this.shadowRoot;if(!e)return;let t=e.getElementById("preview-btn"),o=e.querySelector(".btn-text"),r=e.querySelector(".btn-spinner");t&&o&&r&&(this._submitting?(t.disabled=!0,o.textContent="Validating...",r.style.display="inline-block"):(t.disabled=!1,o.textContent="Preview Request",r.style.display="none"))}_renderLaunchContent(){if(this._launchResult&&this._launchResult.ok){let i=this._pluginContext?.companyPrefix,a=this._launchResult.identifier,c="";if(i&&typeof i=="string"&&/^[A-Za-z0-9_-]{1,80}$/.test(i)&&a&&typeof a=="string"&&/^[A-Za-z0-9_-]{1,120}$/.test(a)){let s=`/${encodeURIComponent(i)}/issues/${encodeURIComponent(a)}`;c=`<a href="${l(s)}" class="task-link" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">Open SPS Task Room</a>`}return`
        <div class="launch-success" style="color: #15803d; font-size: 13px;">
          <p style="margin: 0 0 8px 0; font-weight: 600;">\u2713 Task Room Launched Successfully!</p>
          <p style="margin: 0 0 8px 0;">Issue Identifier: <strong style="font-weight: 700;">${l(a)}</strong></p>
          ${c}
        </div>
      `}let e="";this._launchError&&(e=`
        <div class="launch-error" style="color: #b91c1c; font-size: 13px; margin-bottom: 12px; background: #fee2e2; padding: 8px 12px; border-radius: 6px; border: 1px solid #fca5a5; width: 100%; box-sizing: border-box;">
          <strong>Error launching task room:</strong> ${l(this._launchError.message||String(this._launchError))}
        </div>
      `);let t=this._launching?"disabled":"",o=this._launching?"Launching Task Room...":"Launch Task Room",r=this._launching?"inline-block":"none";return`
      ${e}
      <button type="button" id="launch-btn" class="preview-btn" style="background-color: #059669;" ${t}>
        <span class="launch-btn-text">${l(o)}</span>
        <span class="btn-spinner launch-spinner" style="display: ${r};"></span>
      </button>
    `}async _handleLaunch(){if(this._currentDraft){this._launching=!0,this._launchError=null,this._launchResult=null,this._renderPreviewResult();try{let e=this._pluginContext,t=this._pluginSlot;if(!e)throw new Error("Plugin context not initialized");let o=e.companyId,r=e.projectId||e.entityId,a=`/api/plugins/${t?.pluginId||"local.memory-sidecar"}/actions/direct-task-submit`,c=await fetch(a,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId:o,params:{projectId:r,role:this._currentDraft.role,parentId:this._currentDraft.parentId,title:this._currentDraft.title,description:this._currentDraft.description,idempotencyKey:this._currentDraft.idempotencyKey}})});if(!c.ok){let d=`HTTP ${c.status}`;try{let p=await c.json();d=p.message||p.error||d}catch{}throw new Error(d)}let s=await c.json(),u=[s,s?.result,s?.data,s?.data?.result,s?.result?.data].find(d=>d&&typeof d=="object"&&typeof d.ok=="boolean")||s;if(u&&u.ok)this._launchResult=u;else throw new Error(u?.message||u?.code||"Failed to launch task room.")}catch(e){this._launchError=e}finally{this._launching=!1,this._renderPreviewResult()}}}_renderPreviewResult(){let e=this.shadowRoot;if(!e)return;let t=e.getElementById("preview-result");if(t)if(this._error)t.className="preview-result invalid",t.style.display="flex",t.innerHTML=`
        <h4 class="result-title invalid">Validation Error</h4>
        <p class="result-value">${l(this._error.message||String(this._error))}</p>
      `;else if(this._previewData){let o=this._previewData;if(o.valid){t.className="preview-result valid",t.style.display="flex",t.innerHTML=`
          <h4 class="result-title valid">\u2713 Request Valid</h4>
          <div class="result-grid">
            <div class="result-label">Worker Role:</div>
            <div class="result-value result-value-highlight">${l(o.roleLabel)}</div>

            <div class="result-label">Safety Boundary:</div>
            <div class="result-value result-boundary">${l(o.roleBoundary)}</div>

            <div class="result-label">SPS Outcome:</div>
            <div class="result-value">${l(o.spsStatement)}</div>
          </div>
          <div class="launch-section" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #bbf7d0; display: flex; flex-direction: column; gap: 12px; width: 100%; box-sizing: border-box;">
            ${this._renderLaunchContent()}
          </div>
        `;let r=e.getElementById("launch-btn");r&&r.addEventListener("click",async()=>{this._launching||await this._handleLaunch()})}else t.className="preview-result invalid",t.style.display="flex",t.innerHTML=`
          <h4 class="result-title invalid">\u2717 Validation Failed</h4>
          <p class="result-value">Please correct the highlighted errors in the form above and try again.</p>
        `}else t.style.display="none",t.innerHTML=""}_render(){let e=this.shadowRoot;if(!e)return;let t=this._pluginContext;if(!t){e.innerHTML=`
        <style>${y}</style>
        <div class="loading-container">
          <span class="loading-text">Initializing context...</span>
        </div>
      `;return}let o=t.companyId,r=t.projectId||t.entityId;e.innerHTML=`
      <style>
        ${y}
        
        .execution-status-banner {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .status-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          color: #b45309;
          background: #fef3c7;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .status-text {
          margin: 0;
          font-size: 13px;
          color: #78350f;
          line-height: 1.5;
        }
        .preview-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
          background: #ffffff;
          border: 1px solid #dbe3ec;
          padding: 24px;
          border-radius: 12px;
          margin-bottom: 24px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }
        .form-group select,
        .form-group input,
        .form-group textarea {
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 14px;
          background-color: #f8fafc;
          color: #0f172a;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .form-group select:focus,
        .form-group input:focus,
        .form-group textarea:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
          background-color: #ffffff;
        }
        .field-error {
          font-size: 12px;
          color: #ef4444;
          min-height: 16px;
          margin-top: 2px;
        }
        .preview-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 20px;
          background-color: #4f46e5;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .preview-btn:hover:not(:disabled) {
          background-color: #4338ca;
        }
        .preview-btn:disabled {
          background-color: #94a3b8;
          cursor: not-allowed;
        }
        .btn-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .preview-result {
          padding: 24px;
          border-radius: 12px;
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .preview-result.valid {
          border: 1px solid #bbf7d0;
          background-color: #f0fdf4;
        }
        .preview-result.invalid {
          border: 1px solid #fecaca;
          background-color: #fef2f2;
        }
        .result-title {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
        }
        .result-title.valid { color: #15803d; }
        .result-title.invalid { color: #b91c1c; }
        .result-grid {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 12px;
          font-size: 13px;
          line-height: 1.5;
        }
        @media (max-width: 600px) {
          .result-grid {
            grid-template-columns: 1fr;
            gap: 4px;
          }
          .result-label {
            font-weight: 600;
          }
        }
        .result-label {
          color: #475569;
          font-weight: 500;
        }
        .result-value {
          color: #0f172a;
        }
        .result-value-highlight {
          font-weight: 600;
        }
        .result-boundary {
          font-style: italic;
          background-color: rgba(0, 0, 0, 0.02);
          padding: 8px 12px;
          border-radius: 6px;
          border-left: 3px solid #6366f1;
        }
      </style>

      <div class="header">
        <h2 class="header-title">Legacy Unreal Runner</h2>
        <p class="header-subtitle">Optional Unreal-only agy runner. Standard CTO-created Room Tasks do not use this path.</p>
      </div>

      <div class="content-body">
        <div class="execution-status-banner">
          <span class="status-badge">Controlled Local Execution</span>
          <p class="status-text">A validated request creates one unassigned child Task Room under the selected Agent Room.</p>
        </div>

        <form id="preview-form" class="preview-form">
          <div class="form-group">
            <label for="role-select">Target Worker Role</label>
            <select id="role-select" name="role" required>
              <option value="" disabled selected>Select a legacy Unreal worker role...</option>
              <option value="unreal-code">Legacy Unreal Code Worker (unreal-code)</option>
              <option value="unreal-qa">Legacy Unreal QA Worker (unreal-qa)</option>
            </select>
            <div class="field-error" id="error-role"></div>
          </div>

          <div class="form-group">
            <label for="agent-room-select">Agent Room</label>
            <select id="agent-room-select" name="agentRoom" required disabled>
              <option value="" disabled selected>Select a worker role first...</option>
            </select>
            <div class="field-error" id="error-agent-room"></div>
          </div>

          <div class="form-group">
            <label for="title-input">Task Title</label>
            <input type="text" id="title-input" name="title" placeholder="Enter task title (max 200 chars)" required max="200" />
            <div class="field-error" id="error-title"></div>
          </div>

          <div class="form-group">
            <label for="description-input">Task Description</label>
            <textarea id="description-input" name="description" placeholder="Enter detailed task description (max 4,000 chars)" required rows="6"></textarea>
            <div class="field-error" id="error-description"></div>
          </div>

          <button type="submit" class="preview-btn" id="preview-btn">
            <span class="btn-text">Preview Request</span>
            <span class="btn-spinner" style="display: none;"></span>
          </button>
        </form>

        <div id="preview-result" class="preview-result" style="display: none;"></div>
      </div>
    `,this._setupFormListeners(),this._setupFormChangeListeners()}};customElements.get("paperclip-project-direct-task-preview-tab")||customElements.define("paperclip-project-direct-task-preview-tab",$);var P="paperclip-project-direct-task-preview-tab";export{L as MemoryTab,P as ProjectDirectTaskPreviewTab,z as ProjectMemoryCandidatesTab,M as ProjectMemoryTab};
//# sourceMappingURL=index.js.map
