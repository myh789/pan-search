import type { Env } from '../env';
import { PAN_LABELS } from '@pan-search/shared';
import { APP_CSS, M_CSS } from '../static/css-bundle';

function esc(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function panName(t: number) {
  return PAN_LABELS[t] || '夸克网盘';
}

export function layout(
  conf: Record<string, string>,
  opts: {
    title: string;
    keywords?: string;
    description?: string;
    body: string;
    keyword?: string;
    fixed?: boolean;
    extraScript?: string;
  }
) {
  const color = conf.home_color || '#3e3e3e';
  const theme = conf.home_theme || '#133ab3';
  const bg = conf.home_background || '#fafafa';
  const other = conf.other_background || '#ffffff';
  const kw = esc(opts.keyword || '');
  const logo = conf.logo
    ? `<img class="logo" src="${esc(conf.logo)}" alt="${esc(conf.app_name)}" />`
    : '';
  const name =
    conf.app_name && conf.app_name_hide !== '1'
      ? `<div class="title">${esc(conf.app_name)}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,user-scalable=no,maximum-scale=1.0"/>
<meta name="renderer" content="webkit"/>
<meta name="referrer" content="no-referrer"/>
<title>${esc(opts.title)}</title>
<meta name="keywords" content="${esc(opts.keywords || conf.app_keywords)}"/>
<meta name="description" content="${esc(opts.description || conf.app_description)}"/>
${conf.app_icon ? `<link rel="icon" href="${esc(conf.app_icon)}"/>` : ''}
<style>${APP_CSS}\n${M_CSS}</style>
<style>
:root {
  --theme-color: ${esc(color)};
  --theme-theme: ${esc(theme)};
  --theme-background: ${esc(bg)};
  --theme-other_background: ${esc(other)};
}
${conf.home_css || ''}
.icon-sousuo:before { content: "🔍"; font-style: normal; }
.icon-xiala:before { content: "▾"; font-style: normal; }
.icon-caidan:before { content: "☰"; font-style: normal; }
.icon-fenxiang1:before { content: "⎘"; font-style: normal; margin-right: 4px; }
.icon-fangwen:before { content: "↗"; font-style: normal; margin-right: 4px; }
.modal-mask { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:999; display:none; align-items:center; justify-content:center; }
.modal-mask.show { display:flex; }
.modal { background:#fff; border-radius:12px; padding:20px; width:min(320px,90vw); }
.modal textarea { width:100%; min-height:90px; border:1px solid #eee; border-radius:8px; padding:10px; }
.modal .vbtn { margin-top:12px; text-align:center; background:var(--theme-theme); color:#fff; padding:10px; border-radius:8px; cursor:pointer; }
.source-switch { display:flex; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
.switch-items a { margin-right:10px; padding:4px 12px; border-radius:16px; background:#f0f0f0; }
.switch-items a.active { background:var(--theme-theme); color:#fff; }
.listBox .left .list .item .btns { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
.listBox .left .list .item .btns .btn { display:inline-flex; align-items:center; padding:6px 12px; border-radius:6px; background:#f5f5f5; cursor:pointer; font-size:13px; }
.listBox .left .list .item .btns .btn:hover { color:var(--theme-theme); }
.page { display:flex; gap:8px; justify-content:center; margin:20px 0; }
.page a, .page span { padding:6px 12px; border-radius:6px; background:#fff; border:1px solid #eee; }
.page .cur { background:var(--theme-theme); color:#fff; border-color:transparent; }
.toast { position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.78); color:#fff; padding:8px 16px; border-radius:8px; z-index:1000; display:none; }
</style>
${conf.seo_statistics || ''}
</head>
<body>
<div class="headBg" style="background-image:url('${esc(conf.home_bg || '')}');"></div>
<div id="app">
  <div class="headerBox">
    <div class="bg" id="headerBg" style="opacity:${opts.fixed ? 0 : 1}"></div>
    <div class="box">
      <a href="/" class="logoBox">${logo}${name}</a>
      <div class="search">
        <input id="kwHeader" type="text" value="${kw}" placeholder="输入关键字进行搜索" />
        <div class="btn" onclick="goSearch(document.getElementById('kwHeader').value)"><i class="iconfont icon-sousuo"></i></div>
      </div>
      <div class="navs">
        ${conf.qcode ? `<div class="item" onclick="showModal('qcodeModal')">加入群聊</div>` : ''}
        ${conf.app_demand === '0' || conf.app_demand === '' ? `<div class="item" onclick="showModal('demandModal')">提交需求</div>` : ''}
        <div class="btns">${conf.app_links || ''}</div>
        <div class="iconfont icon-caidan" onclick="showModal('drawerModal')"></div>
      </div>
    </div>
  </div>
  <div class="headerKox"></div>

  ${opts.body}

  <div class="footerBox"><div class="box">
    <p>${conf.footer_dec || ''}</p>
    <p>${conf.footer_copyright || ''}</p>
  </div></div>
</div>

<div id="qcodeModal" class="modal-mask" onclick="if(event.target===this)hideModal('qcodeModal')">
  <div class="modal">${conf.qcode ? `<img src="${esc(conf.qcode)}" style="width:100%"/>` : ''}</div>
</div>
<div id="demandModal" class="modal-mask" onclick="if(event.target===this)hideModal('demandModal')">
  <div class="modal">
    <div class="vname" style="font-weight:bold;margin-bottom:10px">提交需求</div>
    <textarea id="demandText" placeholder="请输入你想看的资源信息~"></textarea>
    <div class="vbtn" onclick="submitDemand()">提交</div>
  </div>
</div>
<div id="drawerModal" class="modal-mask" onclick="if(event.target===this)hideModal('drawerModal')">
  <div class="modal">
    ${conf.qcode ? `<div class="item" style="padding:10px 0;cursor:pointer" onclick="hideModal('drawerModal');showModal('qcodeModal')">加入群聊</div>` : ''}
    ${conf.app_demand === '0' || conf.app_demand === '' ? `<div class="item" style="padding:10px 0;cursor:pointer" onclick="hideModal('drawerModal');showModal('demandModal')">提交需求</div>` : ''}
    <div>${conf.app_links || ''}</div>
  </div>
</div>
<div id="urlModal" class="modal-mask" onclick="if(event.target===this)hideModal('urlModal')">
  <div class="modal" style="width:min(420px,92vw)">
    <div id="urlModalBody"></div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',1800)}
function showModal(id){document.getElementById(id).classList.add('show')}
function hideModal(id){document.getElementById(id).classList.remove('show')}
function goSearch(kw){
  kw=(kw||'').trim();
  if(!kw){toast('请输入你要搜索的内容~');return}
  location.href='/s/'+encodeURIComponent(kw)+'.html';
}
async function submitDemand(){
  const content=document.getElementById('demandText').value.trim();
  if(!content){toast('请输入你想看的资源信息~');return}
  const fd=new URLSearchParams({content});
  const r=await fetch('/api/tool/feedback',{method:'POST',body:fd});
  const j=await r.json();
  toast(j.message||'已提交');
  hideModal('demandModal');
}
function copyText(title,url,code){
  const text=title+'\\n'+url+(code?('\\n提取码：'+code):'');
  navigator.clipboard.writeText(text).then(()=>toast('复制成功')).catch(()=>toast('复制失败'));
}
function openLink(url, title, code, is_type, pc_type){
  pc_type=Number(pc_type||0);
  if(pc_type===1){ window.open(url,'_blank'); return; }
  const body=document.getElementById('urlModalBody');
  let html='';
  if(pc_type!==1){
    const tip = is_type==0?'夸克APP':(is_type==3?'UC浏览器':'手机扫码');
    html += '<div style="text-align:center;margin-bottom:10px">请使用 <b>'+tip+'</b> 扫码获取</div>';
    html += '<div style="text-align:center"><img alt="qr" width="180" height="180" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data='+encodeURIComponent(url)+'"/></div>';
  }
  html += '<div style="margin-top:12px;word-break:break-all"><b>'+(title||'')+'</b><div>'+url+'</div>'+(code?('<div>提取码：<span style="color:#FF3F3D">'+code+'</span></div>'):'')+'</div>';
  if(pc_type!==2) html += '<div style="margin-top:12px;text-align:center"><a href="'+url+'" target="_blank" rel="noopener" style="color:var(--theme-theme)">直接打开</a></div>';
  body.innerHTML=html;
  showModal('urlModal');
}
window.addEventListener('scroll',()=>{
  const bg=document.getElementById('headerBg');
  if(!bg) return;
  const y=window.scrollY||0;
  const th=150;
  bg.style.opacity = y>=th ? Math.min((y-th)/100,1) : Math.max(1-(th-y)/100,0);
});
document.getElementById('kwHeader')?.addEventListener('keyup',e=>{ if(e.key==='Enter') goSearch(e.target.value) });
${opts.extraScript || ''}
</script>
</body></html>`;
}

export async function renderHome(env: Env, conf: Record<string, string>) {
  const cats = await env.DB.prepare(
    'SELECT source_category_id, name, image, is_sys, is_type FROM source_category WHERE status = 0 ORDER BY sort DESC'
  ).all<any>();
  const limit = Number(conf.ranking_num) || 10;
  const mLimit = Number(conf.ranking_m_num) || 6;
  const withImg = conf.ranking_type === '1';

  let newBlock = '';
  if (conf.home_new === '0') {
    const news = await env.DB.prepare(
      `SELECT title, source_id as id FROM source WHERE status=1 AND is_delete=0 AND is_time=0 ORDER BY create_time DESC LIMIT ?`
    )
      .bind(limit)
      .all<any>();
    const items = (news.results || [])
      .map((x: any, i: number) => {
        if (withImg) {
          return `<a href="/d/${x.id}.html" target="_blank" class="item"><div class="img"><span class="titleLoading">${esc(
            String(x.title).slice(0, 20)
          )}</span></div><p>${esc(x.title)}</p></a>`;
        }
        return `<a href="/d/${x.id}.html" target="_blank" class="item"><p><span>${i + 1}</span>${esc(x.title)}</p></a>`;
      })
      .join('');
    newBlock = `<div class="block"><div class="nav">${
      conf.home_new_img ? `<img src="${esc(conf.home_new_img)}" alt="最新更新"/>` : ''
    }最新更新</div><div class="content"><div class="list">${items}</div></div></div>`;
  }

  const blocks: string[] = [];
  for (const cat of cats.results || []) {
    let list: any[] = (await env.KV.get(`ranking:${cat.name}`, 'json')) as any;
    if (!list?.length) {
      const local = await env.DB.prepare(
        `SELECT title, source_id as id FROM source WHERE status=1 AND is_delete=0 AND is_time=0 AND source_category_id=? ORDER BY create_time DESC LIMIT ?`
      )
        .bind(cat.source_category_id, limit)
        .all<any>();
      list = local.results || [];
    }
    const items = (list || [])
      .map((x: any, i: number) => {
        const href = x.id ? `/d/${x.id}.html` : `/s/${encodeURIComponent(x.title)}.html`;
        if (withImg) {
          return `<a href="${href}" target="_blank" class="item"><div class="img"><span class="titleLoading">${esc(
            String(x.title || '').slice(0, 20)
          )}</span></div><p>${esc(x.title)}</p></a>`;
        }
        return `<a href="${href}" target="_blank" class="item"><p><span>${i + 1}</span>${esc(x.title)}</p></a>`;
      })
      .join('');
    blocks.push(
      `<div class="block"><div class="nav">${
        cat.image ? `<img src="${esc(cat.image)}" alt="${esc(cat.name)}"/>` : ''
      }${esc(cat.name)}</div><div class="content"><div class="list">${items}</div></div></div>`
    );
  }

  const logoHtml = conf.logo
    ? `<img class="logo" src="${esc(conf.logo)}" alt="${esc(conf.app_description || conf.app_name)}"/>`
    : '';
  const titleHtml =
    conf.app_name && conf.app_name_hide !== '1' ? `<span class="title">${esc(conf.app_name)}</span>` : '';

  const body = `
  <div class="homeBox searchBox">
    <div class="box">
      <div class="logoBox">${logoHtml}${titleHtml}</div>
      ${conf.app_subname ? `<div class="subTitle">${esc(conf.app_subname)}</div>` : ''}
      <div class="search">
        <input id="kwHome" type="text" placeholder="输入关键字进行搜索"/>
        <div class="btn" onclick="goSearch(document.getElementById('kwHome').value)"><i class="iconfont icon-sousuo"></i></div>
      </div>
    </div>
    <div class="home ${withImg ? '' : 'homeNO'}">${newBlock}${blocks.join('')}</div>
  </div>
  <script>
  document.getElementById('kwHome')?.addEventListener('keyup',e=>{ if(e.key==='Enter') goSearch(e.target.value) });
  // hide extra items on mobile for ranking_m_num
  (function(){
    const m=${mLimit};
    if(!/Mobile/i.test(navigator.userAgent)) return;
    document.querySelectorAll('.home .content .list').forEach(list=>{
      [...list.children].forEach((el,i)=>{ if(i>=m) el.style.display='none'; });
    });
  })();
  </script>`;

  return layout(conf, {
    title: `${conf.app_name} - ${conf.app_title}`,
    body,
    fixed: true,
  });
}

export async function renderList(
  env: Env,
  conf: Record<string, string>,
  name: string,
  page: number,
  cate: string,
  list: any,
  categories: any[],
  panTabs: { type: number; name: string }[]
) {
  const banned = (conf.ban_keywords || '').split(',').map((s) => s.trim()).filter(Boolean);
  const blocked = banned.some((k) => k && name.includes(k));
  const items = blocked ? [] : list.items || [];
  const quan = conf.is_quan === '1';
  const pageSize = list.page_size || 20;
  const total = list.total_result || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const cateLinks = [
    `<a href="/s/${encodeURIComponent(name)}.html" class="${!cate ? 'active' : ''}">全部</a>`,
    ...categories.map(
      (c) =>
        `<a href="/s/${encodeURIComponent(name)}-1-${c.source_category_id}.html" class="${
          String(cate) === String(c.source_category_id) ? 'active' : ''
        }">${esc(c.name)}</a>`
    ),
  ].join('');

  const panLinks = panTabs
    .map((p) => `<a href="javascript:;" data-type="${p.type}" class="pan-tab">${esc(p.name)}</a>`)
    .join('');

  const listHtml = items.length
    ? items
        .map(
          (it: any) => `
    <div class="item">
      <a href="javascript:;" class="title" onclick="openLink('${esc(it.url)}','${esc(it.title)}','${esc(
            it.code || ''
          )}',${Number(it.is_type || 0)},${Number(conf.pc_type || 0)})">${esc(it.title)}</a>
      <div class="type time">${esc(it.times || '')}</div>
      <div class="type"><span>来源：${esc(panName(Number(it.is_type || 0)))}</span>${
            it.code ? `<span>提取码：<span>${esc(it.code)}</span></span>` : ''
          }</div>
      <div class="btns">
        <div class="btn" onclick="copyText('${esc(it.title)}','${esc(it.url)}','${esc(it.code || '')}')"><i class="iconfont icon-fenxiang1"></i>复制分享</div>
        <a href="/d/${it.id}.html" class="btn"><i class="iconfont icon-fangwen"></i>查看详情</a>
        <a href="javascript:;" class="btn" onclick="openLink('${esc(it.url)}','${esc(it.title)}','${esc(
            it.code || ''
          )}',${Number(it.is_type || 0)},${Number(conf.pc_type || 0)})">立即访问</a>
      </div>
    </div>`
        )
        .join('')
    : `<div class="empty muted" style="padding:40px;text-align:center">${esc(
        conf.search_tips || '未找到，可换个关键词尝试哦~'
      )}${conf.search_bg ? `<div><img src="${esc(conf.search_bg)}" style="max-width:220px;margin-top:12px"/></div>` : ''}</div>`;

  const pages: string[] = [];
  if (page > 1) {
    pages.push(
      `<a href="/s/${encodeURIComponent(name)}-${page - 1}${cate ? '-' + cate : ''}.html">上一页</a>`
    );
  }
  pages.push(`<span class="cur">${page}/${totalPages}</span>`);
  if (page < totalPages) {
    pages.push(
      `<a href="/s/${encodeURIComponent(name)}-${page + 1}${cate ? '-' + cate : ''}.html">下一页</a>`
    );
  }

  const body = `
  <div class="searchBox searchList">
    <div class="search">
      <input id="kwList" type="text" value="${esc(name)}" placeholder="输入关键字进行搜索"/>
      <div class="btn" onclick="goSearch(document.getElementById('kwList').value)"><i class="iconfont icon-sousuo"></i></div>
    </div>
  </div>
  <div class="listBox">
    <div class="screen"><div class="fixed">
      <h3>筛选</h3>
      <div class="box" id="filterLocal">${cateLinks}</div>
      <div class="box" id="filterWeb" style="display:none">${panLinks}</div>
    </div></div>
    <div class="left">
      ${
        quan
          ? `<div class="source-switch"><h3>切换搜索源：</h3><div class="switch-items">
              <a href="javascript:;" id="tabLocal" class="active" onclick="switchSource(0)">本地搜</a>
              <a href="javascript:;" id="tabWeb" onclick="switchSource(1)">全网搜</a>
            </div></div>`
          : ''
      }
      <div id="localPane">
        <div class="Qbtn"><div class="btn"><p>为您找到【<span>${esc(name)}</span>】相关资源<span>&nbsp;${total}&nbsp;</span>条</p></div></div>
        <div class="list">${listHtml}</div>
        <div class="page">${pages.join('')}</div>
      </div>
      <div id="webPane" style="display:none">
        <div class="Qbtn"><div class="btn"><p>全网搜索【<span>${esc(name)}</span>】</p></div></div>
        <div class="list" id="webList"><div class="muted" style="padding:20px">点击「全网搜」开始…</div></div>
      </div>
    </div>
  </div>`;

  const extraScript = `
  document.getElementById('kwList')?.addEventListener('keyup',e=>{ if(e.key==='Enter') goSearch(e.target.value) });
  let currentSource=0; let currentPan=0; let esRef=null;
  function switchSource(v){
    currentSource=v;
    document.getElementById('tabLocal')?.classList.toggle('active', v===0);
    document.getElementById('tabWeb')?.classList.toggle('active', v===1);
    document.getElementById('localPane').style.display=v===0?'block':'none';
    document.getElementById('webPane').style.display=v===1?'block':'none';
    document.getElementById('filterLocal').style.display=v===0?'block':'none';
    document.getElementById('filterWeb').style.display=v===1?'block':'none';
    if(v===1) startWebSearch(currentPan);
  }
  document.querySelectorAll('.pan-tab').forEach(a=>{
    a.addEventListener('click',()=>{
      document.querySelectorAll('.pan-tab').forEach(x=>x.classList.remove('active'));
      a.classList.add('active');
      currentPan=Number(a.getAttribute('data-type')||0);
      startWebSearch(currentPan);
    });
  });
  document.querySelector('.pan-tab')?.classList.add('active');
  function startWebSearch(t){
    if(esRef){ try{esRef.close()}catch(e){} }
    const el=document.getElementById('webList');
    el.innerHTML='<div class="muted" style="padding:20px">搜索中…</div>';
    let first=true;
    esRef=new EventSource('/api/other/web_search?title='+encodeURIComponent(${JSON.stringify(
      name
    )})+'&is_type='+t);
    esRef.onmessage=async (ev)=>{
      if(String(ev.data).startsWith('[DONE]')){ esRef.close(); if(first) el.innerHTML='<div class="muted" style="padding:20px">暂无结果</div>'; return; }
      try{
        const item=JSON.parse(ev.data);
        if(first){ el.innerHTML=''; first=false; }
        const row=document.createElement('div');
        row.className='item';
        const title=document.createElement('a');
        title.className='title'; title.href='javascript:;'; title.textContent=item.title||'';
        title.onclick=()=>saveAndOpen(item);
        const meta=document.createElement('div'); meta.className='type'; meta.textContent='全网搜结果';
        const btns=document.createElement('div'); btns.className='btns';
        const b=document.createElement('div'); b.className='btn'; b.textContent='获取链接'; b.onclick=()=>saveAndOpen(item);
        btns.appendChild(b); row.appendChild(title); row.appendChild(meta); row.appendChild(btns); el.appendChild(row);
      }catch(e){}
    };
  }
  async function saveAndOpen(item){
    toast('正在转存…');
    const r=await fetch('/api/other/save_url',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:item.url,stoken:item.stoken})});
    const j=await r.json();
    if(j.code!==200){ toast(j.message||'失败'); return; }
    openLink(j.data.share_url||j.data.url, j.data.title||item.title, j.data.code||'', item.is_type||0, ${Number(
      conf.pc_type || 0
    )});
  }
  `;

  return layout(conf, {
    title: `${name} - 搜索 - ${conf.app_name}`,
    keyword: name,
    body,
    extraScript,
  });
}

export async function renderDetail(conf: Record<string, string>, item: any) {
  const pc = Number(conf.pc_type || 0);
  const body = `
  <div class="searchBox searchDetail">
    <div class="search">
      <input id="kwDetail" type="text" placeholder="输入关键字进行搜索"/>
      <div class="btn" onclick="goSearch(document.getElementById('kwDetail').value)"><i class="iconfont icon-sousuo"></i></div>
    </div>
  </div>
  <div class="listBox detailBox">
    <div class="left">
      <h3>详情</h3>
      <div class="box details">
        ${item.vod_pic ? `<div class="pic"><img src="${esc(item.vod_pic)}" alt="${esc(item.title)}"/></div>` : ''}
        <div class="title">${esc(item.title)}</div>
        <div class="cat"><div class="l">资源分类</div><div class="r">${esc(item.category_name || '其它')}</div></div>
        <div class="cat"><div class="l">资源描述</div><div class="r">${esc(item.vod_content || item.description || '-')}</div></div>
        <div class="cat"><div class="l">更新时间</div><div class="r">${esc(item.times || '')}</div></div>
        <div class="cat"><div class="l">资源类型</div><div class="r">${esc(panName(Number(item.is_type || 0)))}</div></div>
        ${
          pc !== 2
            ? `<div class="cat"><div class="l">资源地址</div><div class="r"><a href="javascript:;" class="btn" onclick="openLink('${esc(
                item.url
              )}','${esc(item.title)}','${esc(item.code || '')}',${Number(item.is_type || 0)},${pc})">${esc(
                item.url
              )}</a></div></div>`
            : ''
        }
        ${item.code ? `<div class="cat"><div class="l">提取码</div><div class="r" style="color:#FF3F3D">${esc(item.code)}</div></div>` : ''}
        <div class="btns" style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <div class="btn" style="padding:8px 14px;background:#f5f5f5;border-radius:8px;cursor:pointer" onclick="copyText('${esc(
            item.title
          )}','${esc(item.url)}','${esc(item.code || '')}')">复制分享</div>
          ${
            pc !== 2
              ? `<a class="btn" style="padding:8px 14px;background:var(--theme-theme);color:#fff;border-radius:8px" href="javascript:;" onclick="openLink('${esc(
                  item.url
                )}','${esc(item.title)}','${esc(item.code || '')}',${Number(item.is_type || 0)},${pc})">立即访问</a>`
              : ''
          }
        </div>
      </div>
    </div>
  </div>
  <script>document.getElementById('kwDetail')?.addEventListener('keyup',e=>{ if(e.key==='Enter') goSearch(e.target.value) });</script>`;

  return layout(conf, {
    title: `${item.title} - ${conf.app_name}`,
    description: item.vod_content || item.description,
    keyword: '',
    body,
  });
}

export async function renderSitemap(env: Env, origin: string) {
  const cached = await env.KV.get('sitemap:xml');
  if (cached) return cached;
  const rows = await env.DB.prepare(
    'SELECT source_id, update_time FROM source WHERE status=1 AND is_delete=0 AND is_time=0 ORDER BY source_id DESC LIMIT 10000'
  ).all<any>();
  const base = origin.replace(/\/$/, '');
  const urls = (rows.results || [])
    .map(
      (r) =>
        `<url><loc>${base}/d/${r.source_id}.html</loc><lastmod>${new Date(
          (r.update_time || 0) * 1000
        ).toISOString()}</lastmod></url>`
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url>${urls}</urlset>`;
  await env.KV.put('sitemap:xml', xml, { expirationTtl: 86400 });
  return xml;
}

/** Parse PHP-compatible /s/{name}[-{page}[-{cate}]].html */
export function parseSearchSlug(raw: string): { name: string; page: number; cate: string } {
  let slug = decodeURIComponent(raw || '');
  slug = slug.replace(/\.html$/i, '');
  // PHP pattern: name = [^-]+ , then optional -page -cate
  const m = slug.match(/^([^-]+)(?:-(\d+)(?:-(\d+))?)?$/);
  if (m) {
    return { name: m[1] || slug, page: Number(m[2] || 1), cate: m[3] || '' };
  }
  return { name: slug, page: 1, cate: '' };
}
