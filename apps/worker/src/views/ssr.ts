import type { Env } from '../env';
import { APP_CSS, M_CSS } from '../static/css-bundle';
import { panIconSrc } from '../static/pan-icons';
import { getHotList, getSameList } from '../services/source';

function esc(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ThinkPHP empty：空串 / 0 / 未设 时显示「提交需求」 */
function showDemand(conf: Record<string, string>) {
  const v = conf.app_demand;
  return v === undefined || v === null || v === '' || v === '0';
}

/** 完整网盘名（对齐原版文案） */
export function panFullName(t: number) {
  const map: Record<number, string> = {
    0: '夸克网盘',
    1: '阿里云盘',
    2: '百度网盘',
    3: 'UC网盘',
    4: '迅雷网盘',
  };
  return map[t] ?? '夸克网盘';
}

function highlightTitle(title: string, keyword: string) {
  const raw = String(title || '');
  const kw = String(keyword || '').trim();
  if (!kw) return esc(raw);
  const tokens = kw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  let out = esc(raw);
  let changed = false;
  for (const t of tokens) {
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const next = out.replace(re, '<span>$1</span>');
    if (next !== out) changed = true;
    out = next;
  }
  return changed ? `<p>${out}</p>` : out;
}

function renderHotSidebar(hotList: { name: string; image: string; list: any[] }[]) {
  if (!hotList?.length) return '';
  return hotList
    .map((vo) => {
      const items = (vo.list || [])
        .slice(0, 5)
        .map(
          (vos: any, i: number) =>
            `<a href="/s/${encodeURIComponent(vos.title)}.html" class="item"><p><span>${i + 1}</span>${esc(
              vos.title
            )}</p></a>`
        )
        .join('');
      return `<div class="nav">${
        vo.image ? `<img src="${esc(vo.image)}" alt="${esc(vo.name)}"/>` : ''
      }${esc(vo.name)}</div><div class="box"><div class="list">${items}</div></div>`;
    })
    .join('');
}

function elPagination(name: string, page: number, totalPages: number, cate: string) {
  if (totalPages <= 1) return '';
  const href = (p: number) =>
    `/s/${encodeURIComponent(name)}-${p}${cate ? '-' + cate : ''}.html`;
  const nums: string[] = [];
  const start = Math.max(1, page - 1);
  const end = Math.min(totalPages, start + 2);
  for (let i = start; i <= end; i++) {
    nums.push(
      i === page
        ? `<li class="number is-active">${i}</li>`
        : `<li class="number"><a href="${href(i)}">${i}</a></li>`
    );
  }
  return `<div class="page">
    <div class="el-pagination is-background">
      ${
        page > 1
          ? `<button type="button" class="btn-prev" onclick="location.href='${href(page - 1)}'">‹</button>`
          : `<button type="button" class="btn-prev" disabled>‹</button>`
      }
      <ul class="el-pager">${nums.join('')}</ul>
      ${
        page < totalPages
          ? `<button type="button" class="btn-next" onclick="location.href='${href(page + 1)}'">›</button>`
          : `<button type="button" class="btn-next" disabled>›</button>`
      }
    </div>
  </div>`;
}

function elEmpty(conf: Record<string, string>, tipHtml: string) {
  const img = conf.search_bg
    ? `<img src="${esc(conf.search_bg)}" style="width:200px"/>`
    : '';
  return `<div class="el-empty" style="margin-top:10%;text-align:center;padding:24px">
    <div class="el-empty__image">${img}</div>
    <div class="el-empty__description"><p>${esc(conf.search_tips || '未找到，可换个关键词尝试哦~')}</p></div>
    ${tipHtml}
  </div>`;
}

function elAlert(msg: string) {
  return `<div style="padding-top:16px"><div class="el-alert el-alert--error is-center" style="padding:12px 0;font-weight:bold;background:#fef0f0;color:#f56c6c;border-radius:4px;text-align:center">${esc(
    msg
  )}</div></div>`;
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
    homeReferrerNever?: boolean;
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
  const appNameJs = JSON.stringify(conf.app_name || '');
  const pcTypeConf = Number(conf.pc_type || 0);
  const linkTtlMin = Math.max(5, Math.min(10080, Number(conf.temp_source_ttl) || 30));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,user-scalable=no,maximum-scale=1.0"/>
<meta name="renderer" content="webkit"/>
<meta name="referrer" content="${opts.homeReferrerNever ? 'never' : 'no-referrer'}"/>
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
/* Element Plus 轻量替代（原版依赖 index.min.css） */
.el-pagination { display:inline-flex; align-items:center; gap:6px; }
.el-pagination .btn-prev,.el-pagination .btn-next {
  min-width:32px; height:32px; border:0; border-radius:2px; background:var(--theme-other_background);
  color:var(--theme-color); cursor:pointer;
}
.el-pagination .el-pager { display:inline-flex; list-style:none; margin:0; padding:0; gap:6px; }
.el-pagination .el-pager li {
  min-width:32px; height:32px; line-height:32px; text-align:center; border-radius:2px;
  background:var(--theme-other_background); cursor:pointer;
}
.el-pagination .el-pager li a { color:inherit; display:block; }
.el-pagination.is-background .el-pager li.is-active {
  background-color:var(--theme-theme)!important; color:var(--theme-other_background)!important;
}
.modal-mask { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:999; display:none; align-items:center; justify-content:center; }
.modal-mask.show { display:flex; }
.toast { position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.78); color:#fff; padding:8px 16px; border-radius:8px; z-index:1000; display:none; }
.listBox .left .list .item .btns .btn .icon { width:16px; height:16px; margin-right:4px; vertical-align:middle; }
.details .cat .r .icon { width:18px; height:18px; margin-right:6px; vertical-align:middle; }
</style>
${conf.seo_statistics || ''}
</head>
<body>
<div class="headBg" style="background-image:url('${esc(conf.home_bg || '')}');"></div>
<div id="app">
  <div class="headerBox">
    <div class="bg" id="headerBg" style="opacity:${opts.fixed ? 0 : 1}"></div>
    <div class="box">
      <a href="/" class="logoBox" id="headerLogo" style="opacity:${opts.fixed ? 0 : 1}">${logo}${name}</a>
      <div class="search" id="headerSearch" style="opacity:${opts.fixed ? 0 : 1}">
        <input id="kwHeader" type="text" value="${kw}" placeholder="输入关键字进行搜索" />
        <div class="btn" onclick="searchBtn(document.getElementById('kwHeader').value)"><i class="iconfont icon-sousuo"></i></div>
      </div>
      <div class="navs">
        ${conf.qcode ? `<div class="item" onclick="showModal('qcodeModal')">加入群聊</div>` : ''}
        ${showDemand(conf) ? `<div class="item" onclick="showModal('demandModal')">提交需求</div>` : ''}
        <div class="btns">${conf.app_links || ''}</div>
        <div class="iconfont icon-caidan" onclick="showModal('drawerModal')"></div>
      </div>
    </div>
  </div>
  <div class="headerKox"></div>

  ${opts.body}

  <div class="footerBox"><div class="box">
    <p>${conf.footer_dec || ''}</p>
    <p>${conf.footer_copyright || ''} <a href="/sitemap.xml" target="_blank">网站地图</a></p>
  </div></div>
</div>

<div id="qcodeModal" class="modal-mask" onclick="if(event.target===this)hideModal('qcodeModal')">
  <div class="el-dialog" style="width:300px;background:var(--theme-other_background);border-radius:8px;padding:16px">
    ${conf.qcode ? `<img src="${esc(conf.qcode)}" style="width:100%"/>` : ''}
  </div>
</div>
<div id="demandModal" class="modal-mask" onclick="if(event.target===this)hideModal('demandModal')">
  <div class="el-dialog" style="width:300px;background:var(--theme-other_background);border-radius:8px;padding:16px">
    <div class="layerBox">
      <div class="vname">提交需求</div>
      <textarea id="demandText" placeholder="请输入你想看的资源信息~" style="width:100%;min-height:90px;border:1px solid #eee;border-radius:8px;padding:10px"></textarea>
      <div class="vbtn" onclick="submitDemand()">提交</div>
    </div>
  </div>
</div>
<div id="drawerModal" class="modal-mask" onclick="if(event.target===this)hideModal('drawerModal')">
  <div class="el-dialog" style="width:300px;background:var(--theme-other_background);border-radius:8px;padding:16px">
    <div class="drawer">
      ${conf.qcode ? `<div class="item" onclick="hideModal('drawerModal');showModal('qcodeModal')">加入群聊</div>` : ''}
      ${showDemand(conf) ? `<div class="item" onclick="hideModal('drawerModal');showModal('demandModal')">提交需求</div>` : ''}
      <div class="btns">${conf.app_links || ''}</div>
    </div>
  </div>
</div>
<div id="urlModal" class="modal-mask" onclick="if(event.target===this)hideModal('urlModal')">
  <div class="el-dialog dialogUrlBox" role="dialog" aria-modal="true">
    <button type="button" class="dialogUrl-close" onclick="hideModal('urlModal')" aria-label="关闭">×</button>
    <div class="dialogUrl" id="urlModalBody"></div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
var APP_NAME=${appNameJs};
var pc_type=${pcTypeConf};
var LINK_TTL_MIN=${linkTtlMin};
var is_m=0;
function handleDeviceType(){
  var mobile=window.matchMedia('(max-width: 768px)').matches;
  is_m=mobile?1:0;
  pc_type=mobile?1:${pcTypeConf};
}
handleDeviceType();
window.addEventListener('resize',handleDeviceType);

function toast(msg){var t=document.getElementById('toast');t.textContent=msg;t.style.display='block';setTimeout(function(){t.style.display='none'},1800)}
function showModal(id){document.getElementById(id).classList.add('show')}
function hideModal(id){
  document.getElementById(id).classList.remove('show');
  if(id==='urlModal'){
    window.__dlgAborted=true;
    if(window.__dlgTimer){ clearInterval(window.__dlgTimer); window.__dlgTimer=null; }
    if(window.__dlgAbortCtrl){ try{ window.__dlgAbortCtrl.abort(); }catch(e){} window.__dlgAbortCtrl=null; }
  }
}
function searchBtn(kw){
  kw=(kw||'').trim();
  if(!kw){toast('请输入你要搜索的内容~');return}
  var music=false;
  if(typeof musicMode!=='undefined' && musicMode) music=true;
  var homeType=document.getElementById('homeSearchType');
  if(homeType && homeType.value==='1') music=true;
  var tabM=document.getElementById('tabMusic');
  if(tabM && tabM.classList.contains('active')) music=true;
  var target='/s/'+encodeURIComponent(kw)+'.html'+(music?'?music=1':'');
  var cur=location.href;
  if(cur.indexOf('/s/')>=0||cur.indexOf('/d/')>=0) location.href=target;
  else window.open(target,'_blank');
}
async function submitDemand(){
  var content=document.getElementById('demandText').value.trim();
  if(!content){toast('请输入你想看的资源信息~');return}
  var fd=new URLSearchParams({content:content});
  var r=await fetch('/api/tool/feedback',{method:'POST',body:fd});
  var j=await r.json();
  toast(j.message||'已提交');
  if(j.code===200) hideModal('demandModal');
}
function copyText(title,url,code){
  var text='标题：'+title+'\\n链接：'+url;
  if(code) text+='\\n提取码：'+code;
  text+='\\n由【'+APP_NAME+location.hostname+'】提供网盘分享链接';
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){toast('复制成功')}).catch(function(){fallbackCopy(text)});
  } else fallbackCopy(text);
}
function fallbackCopy(text){
  var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); toast('复制成功'); }catch(e){ toast('复制失败，请手动复制'); }
  document.body.removeChild(ta);
}
function safeJump(url, target){
  target=target||'_blank';
  var a=document.createElement('a'); a.href=url; a.rel='noreferrer'; a.target=target;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
function openLink(url, title, code, is_type){
  if(Number(pc_type)===1){ safeJump(url); return; }
  showUrlFun({ title:title, showUrl:url, url:url, code:code||'', is_type:Number(is_type||0), message:'' });
}
function showUrlFun(item){
  var body=document.getElementById('urlModalBody');
  var html='';
  window.__dlgItem=item;
  if(item.showUrl){
    if(Number(pc_type)!==1){
      var tipTitle='手机扫码', tipDesc='打开微信APP → 右上角 → 扫一扫';
      if(item.is_type==0){ tipTitle='夸克APP'; tipDesc='打开夸克APP → 搜索框相机 → 扫码'; }
      else if(item.is_type==3){ tipTitle='UC浏览器'; tipDesc='打开UC浏览器 → 搜索框相机 → 扫码'; }
      html+='<div class="dialogUrl-hd"><div class="title">请使用 <span>'+tipTitle+'</span> 扫码</div><div class="tips">'+tipDesc+'</div></div>';
      html+='<div class="qrcode" id="qrcode"></div>';
    }
    html+='<div class="dialogUrl-res">';
    html+='<div class="res-name">'+(item.title||'资源')+'</div>';
    if(Number(pc_type)!==2){
      html+='<a class="res-link" href="'+item.showUrl+'" target="_blank" rel="noopener noreferrer">'+item.showUrl+'</a>';
      html+='<div class="res-actions">';
      html+='<a class="res-btn primary" href="'+item.showUrl+'" target="_blank" rel="noopener noreferrer">打开网盘</a>';
      html+='<a class="res-btn" href="javascript:;" onclick="copyText((__dlgItem&&__dlgItem.title)||\\'\\',(__dlgItem&&(__dlgItem.showUrl||__dlgItem.url))||\\'\\',(__dlgItem&&__dlgItem.code)||\\'\\');return false;">复制链接</a>';
      html+='</div>';
    }
    if(item.code) html+='<div class="res-code">提取码 <b>'+item.code+'</b></div>';
    if(item.linkTtl || Number(item.is_time)===1){
      var ttl=Number(item.linkTtl||LINK_TTL_MIN)||30;
      html+='<div class="res-ttl">链接约 <b>'+ttl+'</b> 分钟内有效，请及时保存到网盘</div>';
    }
    html+='</div>';
  } else {
    html+='<div class="dialogUrl-fail"><div class="title">获取失败</div><div class="tips">'+(item.message||'未知错误')+'</div></div>';
  }
  html+='<div class="statement"><p>本站链接由程序自动收集自公开网盘，不存储、不传播任何文件。请自行辨别内容，违规请向网盘官方举报。仅供学习交流，无收费行为。</p></div>';
  body.innerHTML=html;
  if(item.showUrl && Number(pc_type)!==1){
    try{
      var box=document.getElementById('qrcode');
      if(box && window.qrcanvas && qrcanvas.qrcanvas){
        var canvas=qrcanvas.qrcanvas({ data:item.showUrl, size:140 });
        box.appendChild(canvas);
      } else if(box){
        box.innerHTML='<img alt="qr" width="140" height="140" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data='+encodeURIComponent(item.showUrl)+'"/>';
      }
    }catch(e){}
  }
  showModal('urlModal');
}
window.addEventListener('scroll',function(){
  var bg=document.getElementById('headerBg');
  if(!bg) return;
  var y=window.scrollY||0, th=150;
  var op=y>=th ? Math.min((y-th)/100,1) : Math.max(1-(th-y)/100,0);
  bg.style.opacity=op;
  ${
    opts.fixed
      ? `var logo=document.getElementById('headerLogo'); var search=document.getElementById('headerSearch');
  if(logo) logo.style.opacity=op; if(search) search.style.opacity=op;`
      : ''
  }
  if(is_m){
    var box=document.querySelector('.listBox .screen .fixed .box');
    if(box && box.style.display==='block') box.style.display='none';
  }
});
document.getElementById('kwHeader')?.addEventListener('keyup',function(e){ if(e.key==='Enter') searchBtn(e.target.value) });
${opts.extraScript || ''}
</script>
</body></html>`;
}

export async function renderHome(env: Env, conf: Record<string, string>) {
  const { getCachedCategories, getCachedHomeLatest } = await import('../services/cache');
  const cats = (await getCachedCategories(env)).filter((c: any) => Number(c.status) === 0);
  const limit = Math.min(10, Math.max(1, Number(conf.ranking_num) || 10));
  const mLimit = Math.min(limit, Math.max(1, Number(conf.ranking_m_num) || 6));
  const withImg = conf.ranking_type === '1';

  let newBlock = '';
  if (conf.home_new === '0') {
    const news = await getCachedHomeLatest(env, limit);
    const items = (news || [])
      .slice(0, limit)
      .map((x: any, i: number) => {
        if (withImg) {
          return `<a href="/d/${x.id}.html" target="_blank" class="item" data-rank-i="${i}"><div class="img"><span class="titleLoading">${esc(
            String(x.title).slice(0, 20)
          )}${String(x.title).length > 20 ? '...' : ''}</span></div><p>${esc(x.title)}</p></a>`;
        }
        return `<a href="/d/${x.id}.html" target="_blank" class="item" data-rank-i="${i}"><p><span>${i + 1}</span>${esc(
          x.title
        )}</p></a>`;
      })
      .join('');
    newBlock = `<div class="block"><div class="nav">${
      conf.home_new_img ? `<img src="${esc(conf.home_new_img)}" alt="最新更新"/>` : ''
    }最新更新</div><div class="content"><div class="list">${items}</div></div></div>`;
  }

  const blocks: string[] = [];
  const rankList: { name: string; is_sys: number }[] = [];
  for (const cat of cats) {
    rankList.push({ name: cat.name, is_sys: Number(cat.is_sys) });
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
      .slice(0, limit)
      .map((x: any, i: number) => {
        const href = x.id ? `/d/${x.id}.html` : `/s/${encodeURIComponent(x.title)}.html`;
        if (withImg) {
          const src = x.src
            ? `<img src="${esc(x.src)}" alt="${esc(x.title)}"/><span>Loading...</span>`
            : `<span class="titleLoading">${esc(String(x.title || '').slice(0, 20))}${
                String(x.title || '').length > 20 ? '...' : ''
              }</span>`;
          return `<a href="${href}" target="_blank" class="item" data-rank-i="${i}"><div class="img">${src}</div><p>${esc(
            x.title
          )}</p></a>`;
        }
        return `<a href="${href}" target="_blank" class="item" data-rank-i="${i}"><p><span>${i + 1}</span>${esc(
          x.title
        )}</p></a>`;
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

  const sectionCount = (newBlock ? 1 : 0) + blocks.length;
  const homeClass = [withImg ? '' : 'homeNO', sectionCount === 1 ? 'homeSingle' : ''].filter(Boolean).join(' ');

  const body = `
  <div class="homeBox searchBox">
    <div class="box">
      <div class="logoBox">${logoHtml}${titleHtml}</div>
      ${conf.app_subname ? `<div class="subTitle">${esc(conf.app_subname)}</div>` : ''}
      <div class="search">
        ${
          conf.is_quan === '1'
            ? `<div class="search-type">
                <select id="homeSearchType" aria-label="搜索类型">
                  <option value="0">资源</option>
                  <option value="1">音乐</option>
                </select>
                <i class="iconfont icon-xiala" aria-hidden="true"></i>
              </div>`
            : ''
        }
        <input id="kwHome" type="text" placeholder="输入关键字进行搜索"/>
        <div class="btn" onclick="searchBtn(document.getElementById('kwHome').value)"><i class="iconfont icon-sousuo"></i></div>
      </div>
    </div>
    <div class="home ${homeClass}">${newBlock}${blocks.join('')}</div>
  </div>`;

  const extraScript = `
  document.getElementById('kwHome')?.addEventListener('keyup',function(e){ if(e.key==='Enter') searchBtn(e.target.value) });
  (function(){
    var m=${mLimit};
    if(!/Mobile/i.test(navigator.userAgent)) return;
    document.querySelectorAll('.home .content .list').forEach(function(list){
      Array.prototype.forEach.call(list.children, function(el,i){ if(i>=m) el.style.display='none'; });
    });
  })();
  var rankList=${JSON.stringify(rankList)};
  rankList.forEach(function(item){
    if(item.is_sys!=1) return;
    fetch('/api/tool/ranking?channel='+encodeURIComponent(item.name)).catch(function(){});
  });
  `;

  return layout(conf, {
    title: `${conf.app_name} - ${conf.app_title}`,
    body,
    fixed: true,
    homeReferrerNever: true,
    extraScript,
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
  panTabs: { type: number; name: string }[],
  musicPanTabs: { type: number; name: string }[] = []
) {
  const banned = (conf.ban_keywords || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const blocked = banned.some((k) => k && name.includes(k));
  const items = blocked ? [] : list.items || [];
  const quan = conf.is_quan === '1';
  const pageSize = list.page_size || 20;
  const total = blocked ? 0 : list.total_result || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const hotList = await getHotList(env, 5);
  const firstPan = panTabs[0]?.type ?? 0;
  const musicTabs = musicPanTabs.length ? musicPanTabs : [{ type: 0, name: '夸克' }];
  const firstMusicPan = musicTabs[0]?.type ?? 0;

  const cateLabel =
    categories.find((c) => String(c.source_category_id) === String(cate))?.name || '全部';
  const cateSelectText = cate ? esc(cateLabel) : '全部';

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
    .map(
      (p) =>
        `<a href="javascript:;" class="pan-tab${p.type === firstPan ? ' active' : ''}" data-type="${
          p.type
        }" onclick="setType(${p.type})">${esc(p.name)}</a>`
    )
    .join('');
  const musicPanLinks = musicTabs
    .map(
      (p) =>
        `<a href="javascript:;" class="pan-tab${p.type === firstMusicPan ? ' active' : ''}" data-type="${
          p.type
        }" onclick="setType(${p.type})">${esc(p.name)}</a>`
    )
    .join('');

  let localInner = '';
  if (items.length) {
    const rows = items
      .map((it: any, key: number) => {
        const t = Number(it.is_type || 0);
        return `<div class="item">
          <a href="javascript:;" onclick="linkBtn(this)" data-index="${key}" class="title">${highlightTitle(
            it.title,
            name
          )}</a>
          <div class="type time">${esc(it.times || '')}</div>
          <div class="type"><span>来源：${esc(panFullName(t))}</span>${
            it.code ? `<span>提取码：<span>${esc(it.code)}</span></span>` : ''
          }</div>
          <div class="btns">
            <div class="btn" onclick="copyItem(${key})"><i class="iconfont icon-fenxiang1"></i>复制分享</div>
            <a href="/d/${it.id}.html" class="btn"><i class="iconfont icon-fangwen"></i>查看详情</a>
            <a href="javascript:;" onclick="linkBtn(this)" data-index="${key}" class="btn">
              <img src="${panIconSrc(t)}" class="icon" alt="立即访问"/>立即访问
            </a>
          </div>
        </div>`;
      })
      .join('');
    localInner = `${
      quan
        ? `<div class="Qbtn"><div class="btn"><p>为您找到【<span>${esc(
            name
          )}</span>】相关资源<span>&nbsp;${total}&nbsp;</span>条</p></div></div>`
        : ''
    }
      <div class="list">${rows}</div>
      ${elPagination(name, page, totalPages, cate)}`;
  } else {
    localInner = `${blocked ? elAlert('搜索词中包含违规内容，请修改后重试') : ''}
      ${elEmpty(
        conf,
        quan
          ? `<div class="vtips" onclick="switchSource(1)">请尝试切换&nbsp;“<a href="javascript:;">全网搜</a>”&nbsp;获取资源</div>`
          : ''
      )}`;
  }

  const body = `
  <div class="searchBox searchList">
    <div class="search">
      <div class="select" id="selectLocal" onclick="selectBtn()">
        ${cateSelectText}
        <i class="iconfont icon-xiala" style="font-size:3vw"></i>
      </div>
      <div class="select" id="selectWeb" style="display:none" onclick="selectBtn()">
        <span id="selectWebLabel">${esc(panTabs[0]?.name || '夸克')}</span>
        <i class="iconfont icon-xiala" style="font-size:3vw"></i>
      </div>
      <input id="kwList" type="text" value="${esc(name)}" placeholder="输入关键字进行搜索"/>
      <div class="btn" onclick="searchBtn(document.getElementById('kwList').value)"><i class="iconfont icon-sousuo"></i></div>
    </div>
  </div>
  <div class="listBox">
    <div class="screen"><div class="fixed">
      <h3>筛选</h3>
      <div class="box" id="filterLocal">${cateLinks}</div>
      <div class="box" id="filterWeb" style="display:none">${panLinks}</div>
      <div class="box" id="filterMusic" style="display:none">${musicPanLinks}</div>
    </div></div>
    <div class="left">
      ${
        quan
          ? `<div class="source-switch"><h3>切换搜索源：</h3><div class="switch-items">
              <a href="javascript:;" id="tabLocal" class="active" onclick="switchSource(0)">本地搜</a>
              <a href="javascript:;" id="tabWeb" onclick="switchSource(1)">全网搜</a>
              <a href="javascript:;" id="tabMusic" onclick="switchSource(2)">音乐搜</a>
            </div></div>`
          : `<h3>为您找到【<span>${esc(name)}</span>】相关资源<span>&nbsp;${total}&nbsp;</span>条</h3>`
      }
      <div class="box" id="localPane">${localInner}</div>
      <div class="Ebox" id="webPane" style="display:none">
        <div class="Qloading" id="webLoading" style="display:none"><div class="loader"></div></div>
        <div class="Qbtn"><div class="btn"><p>为您找到【<span>${esc(
          name
        )}</span>】相关<span id="webKind">资源</span><span>&nbsp;<span id="webCount">0</span>&nbsp;</span>条</p></div></div>
        <div class="list" id="webList"></div>
        <div id="webEmpty" style="display:none">
          ${elEmpty(
            conf,
            quan
              ? `<div class="vtips" onclick="switchSource(0)">请尝试切换&nbsp;“<a href="javascript:;">本地搜</a>”&nbsp;获取资源</div>`
              : ''
          )}
        </div>
      </div>
    </div>
    <div class="right">${renderHotSidebar(hotList)}</div>
  </div>`;

  const listJson = JSON.stringify(
    items.map((it: any) => ({
      title: it.title,
      url: it.url,
      code: it.code || '',
      is_type: Number(it.is_type || 0),
      id: it.id,
    }))
  );

  const extraScript = `
  document.getElementById('kwList')?.addEventListener('keyup',function(e){ if(e.key==='Enter') searchBtn(e.target.value) });
  var currentSource=0, musicMode=0, is_type=${firstPan}, QList=[], QLoading=false, currentEventSource=null;
  var localItems=${listJson};
  var panNames=${JSON.stringify(Object.fromEntries(panTabs.map((p) => [p.type, p.name])))};
  var musicPanNames=${JSON.stringify(Object.fromEntries(musicTabs.map((p) => [p.type, p.name])))};
  var firstPan=${firstPan}, firstMusicPan=${firstMusicPan};

  function selectBtn(){
    if(!is_m) return;
    var boxes=document.querySelectorAll('.listBox .screen .fixed .box');
    var box=currentSource===0?boxes[0]:(musicMode?document.getElementById('filterMusic'):document.getElementById('filterWeb'));
    if(!box) return;
    if(box.style.display==='none'||box.style.display==='') box.style.display='block';
    else box.style.display='';
  }
  function linkBtn(el){
    var index=Number(el.getAttribute('data-index'));
    var item=localItems[index];
    if(!item) return;
    if(pc_type==1) safeJump(item.url);
    else { item.showUrl=item.url; showUrlFun(item); }
  }
  function copyItem(index){
    var item=localItems[index];
    if(!item) return;
    copyText(item.title,item.url,item.code||'');
  }
  function applyPanFilterUi(){
    var useMusic=!!musicMode && currentSource===1;
    document.getElementById('filterLocal').style.display=currentSource===0?'':'none';
    document.getElementById('filterWeb').style.display=currentSource===1&&!musicMode?'':'none';
    document.getElementById('filterMusic').style.display=currentSource===1&&musicMode?'':'none';
    var names=useMusic?musicPanNames:panNames;
    document.getElementById('selectWebLabel').textContent=names[is_type]||'夸克';
    var box=useMusic?document.getElementById('filterMusic'):document.getElementById('filterWeb');
    if(box){
      box.querySelectorAll('.pan-tab').forEach(function(a){
        a.classList.toggle('active', Number(a.getAttribute('data-type'))===is_type);
      });
    }
  }
  function setType(type){
    selectBtn();
    if(type==is_type && currentSource==1 && QList.length) return;
    is_type=type;
    QLoading=false; QList=[];
    switchSource(musicMode ? 2 : 1, true);
  }
  function switchSource(source, keepType){
    // 0=本地 1=全网资源 2=音乐线路
    musicMode = source===2 ? 1 : 0;
    currentSource = source===0 ? 0 : 1;
    if(!keepType){
      if(source===1) is_type = firstPan;
      if(source===2) is_type = firstMusicPan;
    }
    document.getElementById('tabLocal')?.classList.toggle('active', source===0);
    document.getElementById('tabWeb')?.classList.toggle('active', source===1);
    document.getElementById('tabMusic')?.classList.toggle('active', source===2);
    document.getElementById('localPane').style.display=source===0?'block':'none';
    document.getElementById('webPane').style.display=source===0?'none':'block';
    document.getElementById('selectLocal').style.display=source===0?'':'none';
    document.getElementById('selectWeb').style.display=source===0?'none':'';
    var kind=document.getElementById('webKind');
    if(kind) kind.textContent=musicMode?'音乐':'资源';
    applyPanFilterUi();
    if(source===0) return;
    QLoading=false; QList=[];
    startWebSearch();
  }
  function startWebSearch(){
    if(currentEventSource){ try{currentEventSource.close()}catch(e){} }
    QLoading=true; QList=[];
    document.getElementById('webLoading').style.display='block';
    document.getElementById('webList').innerHTML='';
    document.getElementById('webEmpty').style.display='none';
    document.getElementById('webCount').textContent='0';
    var kind=document.getElementById('webKind');
    if(kind) kind.textContent=musicMode?'音乐':'资源';
    var params=new URLSearchParams({ title:${JSON.stringify(name)}, is_type:String(is_type), scene:String(musicMode?1:0) });
    currentEventSource=new EventSource('/api/other/web_search?'+params.toString());
    currentEventSource.onmessage=function(event){
      if(String(event.data).indexOf('[DONE]')>=0){
        currentEventSource.close(); currentEventSource=null; QLoading=false;
        document.getElementById('webLoading').style.display='none';
        if(!QList.length) document.getElementById('webEmpty').style.display='block';
        return;
      }
      try{
        var data=JSON.parse(event.data);
        QList.push(data);
        document.getElementById('webCount').textContent=String(QList.length);
        appendWebItem(data, QList.length-1);
      }catch(e){}
    };
    currentEventSource.onerror=function(){
      if(currentEventSource){ currentEventSource.close(); currentEventSource=null; }
      QLoading=false;
      document.getElementById('webLoading').style.display='none';
      if(!QList.length) document.getElementById('webEmpty').style.display='block';
    };
  }
  function panLabel(t){
    t=Number(t||0);
    if(t===1) return '来源：阿里云盘';
    if(t===2) return '来源：百度网盘';
    if(t===3) return '来源：UC网盘';
    if(t===4) return '来源：迅雷网盘';
    return '来源：夸克网盘';
  }
  function appendWebItem(item,index){
    var el=document.getElementById('webList');
    var row=document.createElement('div'); row.className='item';
    row.innerHTML='<a href="javascript:;" onclick="getUrlBtn(this)" data-index="'+index+'" class="title"></a>'+
      '<div class="type"><span>'+panLabel(item.is_type)+'</span></div>'+
      '<div class="btns2" onclick="getUrlBtn(this)" data-index="'+index+'">获取资源</div>';
    row.querySelector('.title').textContent=item.title||'';
    el.appendChild(row);
  }
  async function getUrlBtn(el){
    var index=Number(el.getAttribute('data-index'));
    var item=QList[index];
    if(!item) return;
    if(String(item.url||'').indexOf('http')===0){
      item.showUrl=item.url; showUrlFun(item); return;
    }
    showModal('urlModal');
    window.__dlgAborted=false;
    if(window.__dlgTimer){ clearInterval(window.__dlgTimer); window.__dlgTimer=null; }
    var WAIT_SEC=40;
    var left=WAIT_SEC;
    function renderLoading(){
      document.getElementById('urlModalBody').innerHTML=
        '<div class="dialogUrl-loading"><div class="dlg-spinner" aria-hidden="true"></div>'+
        '<p>链接安全检查中，请稍后</p>'+
        '<p class="dlg-countdown">预计还需 <b id="dlgCountNum">'+left+'</b> 秒</p></div>';
    }
    renderLoading();
    window.__dlgTimer=setInterval(function(){
      left--;
      var n=document.getElementById('dlgCountNum');
      if(n) n.textContent=String(Math.max(0,left));
      if(left<=0){
        if(window.__dlgTimer){ clearInterval(window.__dlgTimer); window.__dlgTimer=null; }
        window.__dlgAborted=true;
        if(window.__dlgAbortCtrl){ try{ window.__dlgAbortCtrl.abort(); }catch(e){} }
        item.showUrl='';
        item.message='资源貌似不见了，请选择其他资源尝试';
        showUrlFun(item);
      }
    },1000);
    try{
      var ctrl=typeof AbortController!=='undefined'?new AbortController():null;
      window.__dlgAbortCtrl=ctrl;
      var r=await fetch('/api/other/save_url',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({ url:encodeURIComponent(item.url), title:item.title, stoken:item.stoken }),
        signal: ctrl?ctrl.signal:undefined
      });
      if(window.__dlgAborted) return;
      if(window.__dlgTimer){ clearInterval(window.__dlgTimer); window.__dlgTimer=null; }
      window.__dlgAbortCtrl=null;
      var j=await r.json();
      if(window.__dlgAborted) return;
      if(j.code==200){
        item.url=j.data.url||j.data.share_url; item.showUrl=item.url;
        if(j.data.code) item.code=j.data.code;
        item.linkTtl=LINK_TTL_MIN;
        item.is_time=1;
      } else {
        item.showUrl=''; item.message=j.message||'获取失败';
      }
      showUrlFun(item);
    }catch(e){
      if(window.__dlgAborted) return;
      if(window.__dlgTimer){ clearInterval(window.__dlgTimer); window.__dlgTimer=null; }
      window.__dlgAbortCtrl=null;
      item.showUrl='';
      item.message=(e&&e.name==='AbortError')?'资源貌似不见了，请选择其他资源尝试':'网络错误';
      showUrlFun(item);
    }
  }
  ${
    quan && !blocked
      ? `(function(){
    var wantMusic=/(?:^|[?&])music=1(?:&|$)/.test(location.search);
    if(wantMusic) switchSource(2);
    else if(${items.length === 0 ? 'true' : 'false'}) switchSource(1);
  })();`
      : ''
  }
  `;

  return layout(conf, {
    title: `${name} - 搜索 - ${conf.app_name}`,
    keyword: name,
    body,
    extraScript,
  });
}

export async function renderDetail(env: Env, conf: Record<string, string>, item: any) {
  const pc = Number(conf.pc_type || 0);
  const hotList = await getHotList(env, 5);
  const sameList = await getSameList(env, { id: item.id, title: item.title }, 10);
  const t = Number(item.is_type || 0);

  const sameHtml = sameList
    .map(
      (vo: any, i: number) =>
        `<a href="/d/${vo.source_id}.html" class="item"><p><span>${i + 1}</span>${esc(vo.title)}</p></a>`
    )
    .join('');

  const cateSuffix = item.category_name ? ` - ${item.category_name}` : '';

  const body = `
  <div class="searchBox searchDetail">
    <div class="search">
      <input id="kwDetail" type="text" placeholder="输入关键字进行搜索"/>
      <div class="btn" onclick="searchBtn(document.getElementById('kwDetail').value)"><i class="iconfont icon-sousuo"></i></div>
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
        <div class="cat"><div class="l">资源类型</div><div class="r">
          <img src="${panIconSrc(t)}" class="icon" alt="网盘图标"/>
          <span>${esc(panFullName(t))}</span>
        </div></div>
        ${
          pc !== 2
            ? `<div class="cat" id="urlRow"><div class="l">资源地址</div><div class="r"><a href="javascript:;" onclick="linkBtn()" class="btn">${esc(
                item.url
              )}</a></div></div>`
            : ''
        }
        ${
          item.code
            ? `<div class="cat"><div class="l">提取码</div><div class="r" style="color:#FF3F3D">${esc(
                item.code
              )}</div></div>`
            : ''
        }
        <div class="btns">
          <div class="btn" onclick="copyText(detailItem.title,detailItem.url,detailItem.code||'')"><i class="iconfont icon-fenxiang1"></i>复制分享</div>
          <a class="btn btnCol" href="javascript:;" onclick="linkBtn()"><i class="iconfont icon-yun_o"></i>立即访问</a>
        </div>
      </div>
      <h3 class="samelistNav">相关资源</h3>
      <div class="box details samelistBox">
        <div class="samelist">${sameHtml || '<p class="muted" style="padding:12px">暂无相关资源</p>'}</div>
      </div>
    </div>
    <div class="right">${renderHotSidebar(hotList)}</div>
  </div>`;

  const detailJson = JSON.stringify({
    title: item.title,
    url: item.url,
    code: item.code || '',
    is_type: t,
    showUrl: item.url,
  });

  const extraScript = `
  document.getElementById('kwDetail')?.addEventListener('keyup',function(e){ if(e.key==='Enter') searchBtn(e.target.value) });
  var detailItem=${detailJson};
  function linkBtn(){
    if(pc_type==1) safeJump(detailItem.url);
    else { detailItem.showUrl=detailItem.url; showUrlFun(detailItem); }
  }
  if(pc_type==2){ var row=document.getElementById('urlRow'); if(row) row.style.display='none'; }
  `;

  return layout(conf, {
    title: `${item.title}${cateSuffix} - ${conf.app_name}`,
    description: item.vod_content || item.description,
    keyword: '',
    body,
    extraScript,
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
  const m = slug.match(/^([^-]+)(?:-(\d+)(?:-(\d+))?)?$/);
  if (m) {
    return { name: m[1] || slug, page: Number(m[2] || 1), cate: m[3] || '' };
  }
  return { name: slug, page: 1, cate: '' };
}
