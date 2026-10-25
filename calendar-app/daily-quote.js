'use strict';
// English renderings below are our translations of the cited public-domain texts.
const quotes=[
 ['学而时习之，不亦说乎？','Is it not a pleasure to practise what you have learned?','《论语·学而》'],
 ['温故而知新，可以为师矣。','Revisit what you know, and discover something new.','《论语·为政》'],
 ['知之者不如好之者，好之者不如乐之者。','Knowing is surpassed by loving; loving, by finding joy.','《论语·雍也》'],
 ['三人行，必有我师焉。','Among those beside me, there is always someone to learn from.','《论语·述而》'],
 ['工欲善其事，必先利其器。','To do your work well, first prepare your tools.','《论语·卫灵公》'],
 ['君子欲讷于言而敏于行。','Be measured in speech and diligent in action.','《论语·里仁》'],
 ['知之为知之，不知为不知，是知也。','Wisdom is knowing what you know and what you do not.','《论语·为政》'],
 ['学而不思则罔，思而不学则殆。','Learning needs reflection, and reflection needs learning.','《论语·为政》'],
 ['不积跬步，无以至千里。','A long journey is made of small steps.','《荀子·劝学》'],
 ['锲而不舍，金石可镂。','With persistence, even metal and stone can be carved.','《荀子·劝学》'],
 ['千里之行，始于足下。','A journey of a thousand miles begins beneath your feet.','《老子》第六十四章'],
 ['知足者富。','Those who know contentment are rich.','《老子》第三十三章'],
 ['为之于未有，治之于未乱。','Act before trouble begins; bring order before disorder arrives.','《老子》第六十四章'],
 ['合抱之木，生于毫末。','A tree too wide to embrace begins as a tiny shoot.','《老子》第六十四章'],
 ['博学之，审问之，慎思之，明辨之，笃行之。','Learn widely, ask carefully, think deeply, judge clearly, and act faithfully.','《礼记·中庸》'],
 ['行到水穷处，坐看云起时。','Walk to the end of the stream; sit and watch the clouds rise.','王维《终南别业》'],
 ['欲穷千里目，更上一层楼。','To see farther, climb one more storey.','王之涣《登鹳雀楼》'],
 ['读书破万卷，下笔如有神。','Read deeply and widely, and the words will come alive.','杜甫《奉赠韦左丞丈二十二韵》'],
 ['山重水复疑无路，柳暗花明又一村。','Beyond the winding hills and streams, another village comes into view.','陆游《游山西村》'],
 ['纸上得来终觉浅，绝知此事要躬行。','What you learn on paper needs the understanding that comes from doing.','陆游《冬夜读书示子聿》'],
 ['问渠那得清如许？为有源头活水来。','What keeps the water clear? A living spring that never stops flowing.','朱熹《观书有感二首·其一》'],
 ['不畏浮云遮望眼，自缘身在最高层。','Clouds cannot hide the view when you stand above them.','王安石《登飞来峰》'],
 ['长风破浪会有时，直挂云帆济沧海。','The day will come to ride the wind and sail across the sea.','李白《行路难·其一》'],
 ['此中有真意，欲辨已忘言。','There is meaning here beyond the words I try to find.','陶渊明《饮酒·其五》']
].map(([zh,en,source],id)=>({id,zh,en,source,translation:'GaryHub 译文'}));
function dailyQuote(now=new Date(),timezone='Etc/UTC'){
 let parts;try{parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);}catch{timezone='Etc/UTC';return dailyQuote(now,timezone);}
 const p=t=>parts.find(x=>x.type===t).value,date=`${p('year')}-${p('month')}-${p('day')}`;
 const day=Math.floor(Date.parse(date+'T00:00:00Z')/86400000),index=((day*7+11)%quotes.length+quotes.length)%quotes.length;
 return {...quotes[index],date,timezone};
}
function registerDailyQuote(app,{db,requireLogin}){app.get('/api/daily-quote',requireLogin,async(req,res,next)=>{try{const u=await db.get('SELECT timezone FROM users WHERE id=?',[req.session.user.id]);res.json(dailyQuote(new Date(),u?.timezone||'Etc/UTC'));}catch(e){next(e);}});}
module.exports={quotes,dailyQuote,registerDailyQuote};
