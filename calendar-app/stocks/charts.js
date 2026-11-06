'use strict';

window.StockCharts = (() => {
  const ns = 'http://www.w3.org/2000/svg';
  const W = 540, left = 57, right = W-12, top = 18, priceBottom = 153;
  const volumeTop = 175, volumeBottom = 213;
  const colors = {rise:'#b53c3b',fall:'#17705a',line:'#155f88',ma5:'#906500',ma10:'#7759a5',ma20:'#1f7094'};
  const fmt = (n,d=2) => Number.isFinite(n) ? n.toLocaleString('zh-CN',{maximumFractionDigits:d}) : '—';
  const hhmm = value => value.slice(0,2)+':'+value.slice(2);
  const element = (tag,text) => Object.assign(document.createElement(tag),{textContent:text});

  function shape(parent, tag, attributes, text) {
    const child=document.createElementNS(ns,tag);
    for(const [name,value] of Object.entries(attributes)) child.setAttribute(name,value);
    if(text !== undefined) child.textContent=text;
    parent.append(child);
    return child;
  }
  function line(svg,x1,y1,x2,y2,stroke,extra={}) {
    return shape(svg,'line',{x1,y1,x2,y2,stroke,...extra});
  }
  function label(svg,x,y,text,align='start') {
    shape(svg,'text',{x,y,'text-anchor':align,fill:'#50645d','font-size':14},text);
  }
  function axes(svg,values) {
    let low=Math.min(...values),high=Math.max(...values);
    if(low===high){const pad=Math.max(0.01,Math.abs(high)*0.005);low-=pad;high+=pad;}
    const y=v=>priceBottom-(v-low)/(high-low)*(priceBottom-top);
    for(const value of [high,(low+high)/2,low]){
      line(svg,left,y(value),right,y(value),'#dce5e1');
      label(svg,left-5,y(value)+4,fmt(value),'end');
    }
    return y;
  }
  function frame(title,height){
    const root=element('div','');root.className='chart';
    const svg=shape(root,'svg',{viewBox:'0 0 '+W+' '+height,tabindex:0,role:'slider','aria-label':title+'，左右方向键查看数据'});
    const readout=element('output','');readout.className='chart-readout';
    root.append(readout);
    return {root,svg,readout};
  }
  function explore(frame,xs,topY,bottomY,describe) {
    const {svg,readout}=frame;
    const marker=line(svg,0,topY,0,bottomY,'#4c6158',{'stroke-dasharray':'3 3','pointer-events':'none'});
    let current=xs.length-1;
    function select(index){
      current=Math.max(0,Math.min(xs.length-1,index));
      marker.setAttribute('x1',xs[current]);marker.setAttribute('x2',xs[current]);
      readout.textContent=describe(current);
      svg.setAttribute('aria-valuenow',current+1);svg.setAttribute('aria-valuetext',readout.textContent);
    }
    function point(event){
      const bounds=svg.getBoundingClientRect();
      if(!bounds.width)return;
      const x=(event.clientX-bounds.left)/bounds.width*W;
      let nearest=0;
      for(let i=1;i<xs.length;i++) if(Math.abs(xs[i]-x)<Math.abs(xs[nearest]-x))nearest=i;
      select(nearest);
    }
    svg.setAttribute('aria-valuemin',1);svg.setAttribute('aria-valuemax',xs.length);
    svg.addEventListener('pointerdown',point);
    svg.addEventListener('pointermove',point);
    svg.addEventListener('keydown',e=>{
      const destinations={ArrowLeft:current-1,ArrowRight:current+1,Home:0,End:xs.length-1};
      if(!(e.key in destinations))return;
      e.preventDefault();select(destinations[e.key]);
    });
    select(current);
  }
  function daily(data) {
    const {bars,volumes,averages}=data;
    const chart=frame('日 K、移动均线和成交量',242), {root,svg}=chart;
    const spacing=(right-left)/bars.length;
    const xs=bars.map((_,i)=>left+(i+.5)*spacing);
    const values=bars.flatMap(b=>[b[3],b[4]]).concat(...Object.values(averages).map(a=>a.filter(Number.isFinite)));
    const y=axes(svg,values),maxVolume=Math.max(0,...volumes.filter(Number.isFinite));
    label(svg,left-5,volumeTop+10,'量','end');
    line(svg,left,volumeBottom,right,volumeBottom,'#dce5e1');
    bars.forEach(([,open,close,high,low],i)=>{
      const color=close>=open?colors.rise:colors.fall,x=xs[i],w=Math.min(14,spacing*0.54);
      line(svg,x,y(low),x,y(high),color,{'stroke-width':1.4});
      shape(svg,'rect',{x:x-w/2,y:Math.min(y(open),y(close)),width:w,height:Math.max(1.5,Math.abs(y(open)-y(close))),fill:color});
      if(volumes[i]>0 && maxVolume>0){
        const h=Math.max(1,volumes[i]/maxVolume*(volumeBottom-volumeTop));
        shape(svg,'rect',{x:x-w/2,y:volumeBottom-h,width:w,height:h,fill:color,opacity:.65});
      }
    });
    const legend=element('div','');legend.className='chart-legend';
    for(const [key,series] of Object.entries(averages)){
      const tag=element('span',key.toUpperCase());tag.style.color=colors[key];legend.append(tag);
      let path='',connected=false;
      series.forEach((value,i)=>{
        if(!Number.isFinite(value)){connected=false;return;}
        path+=(connected?' L':' M')+xs[i]+' '+y(value);connected=true;
      });
      if(path)shape(svg,'path',{d:path,fill:'none',stroke:colors[key],'stroke-width':1.9});
    }
    root.prepend(legend);
    label(svg,left,235,bars[0][0].slice(5));label(svg,right,235,bars.at(-1)[0].slice(5),'end');
    explore(chart,xs,top,volumeBottom,i=>{
      const [date,open,close,high,low]=bars[i];
      return date+'　开 '+fmt(open)+'　高 '+fmt(high)+'　低 '+fmt(low)+'　收 '+fmt(close)+
        '　量 '+fmt(volumes[i],0)+' 手　'+['ma5','ma10','ma20'].map(k=>k.toUpperCase()+' '+fmt(averages[k][i])).join('　');
    });
    root.append(element('small',data.source+' · '+data.adjust+' · '+bars.length+' 个交易日 · 红涨绿跌，均线按收盘价计算'));
    return root;
  }

  const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(2));
  function intraday(data){
    const {points,previous,date}=data;
    if(!points.length) return element('p','该交易日暂无有效分时成交价。');
    const chart=frame('分时成交价',185),{root,svg}=chart;
    const times=points.map(p=>minutes(p[0]));
    // Compress the midday break while retaining a visible separation between sessions.
    const exchangeMinute=t=>t>=780?t-84:t;
    const first=Math.min(570,times[0]),last=Math.max(900,times.at(-1));
    const x=t=>left+(exchangeMinute(t)-exchangeMinute(first))/(exchangeMinute(last)-exchangeMinute(first))*(right-left);
    const xs=times.map(x),prices=points.map(p=>p[1]);
    const y=axes(svg,Number.isFinite(previous)?[...prices,previous]:prices);
    if(Number.isFinite(previous))line(svg,left,y(previous),right,y(previous),'#7d8e85',{'stroke-dasharray':'4 4'});
    let path='';
    points.forEach(([,price],i)=>{
      const gap=i===0||times[i]-times[i-1]>1;
      path+=(gap?' M':' L')+xs[i]+' '+y(price);
      if(gap)shape(svg,'circle',{cx:xs[i],cy:y(price),r:1.7,fill:colors.line});
    });
    shape(svg,'path',{d:path,fill:'none',stroke:colors.line,'stroke-width':2.3});
    label(svg,left,178,first<570?hhmm(points[0][0]):'09:30');
    label(svg,(x(690)+x(780))/2,178,'11:30 / 13:00','middle');
    label(svg,right,178,last>900?hhmm(points.at(-1)[0]):'15:00','end');
    explore(chart,xs,top,priceBottom,i=>hhmm(points[i][0])+'　成交价 '+fmt(points[i][1])+' 元'+
      (Number.isFinite(previous)?'　昨收 '+fmt(previous)+' 元':''));
    root.append(element('small',data.source+' · '+date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8)+' · 北京时间'+(data.stale?' · 上次分时':'')+
      (Number.isFinite(previous)?' · 虚线为昨收':'')));
    return root;
  }
  return {daily,intraday};
})();
