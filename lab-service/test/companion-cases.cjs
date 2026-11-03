/* Companion regression set. Each case is [message, expectation, context].
   expectation: a destination id, or {kind, includes?, excludes?, lang?}. Loaded by node:test and by the demo page. */
((root, factory) => {
  const cases = factory();
  if (typeof module === 'object' && module.exports) module.exports = cases;
  else root.GaryHubCompanionCases = cases;
})(typeof window === 'object' ? window : this, () => {
  const admin = {role:'admin'}, subscriber = {role:'user', accountTier:'subscriber'}, member = {role:'user', accountTier:'standard'};
  const single = [
    ['PDF 打印出来太黑了，想淡一点', 'pdf'],
    ['你好，我想把PDF调浅一点', 'pdf'],
    ['pdf', {kind:'recommend', includes:'pdf', lang:'zh'}],
    ['打印讲义想省点墨', {kind:'clarify', includes:'pdf'}],
    ['我想打开带公式的 markdown', 'markdown'],
    ['照片里有个路人想P掉', 'eraser'],
    ['帮我去掉图片上的水印', 'eraser'],
    ['这门课期末要考多少分才能拿A', 'grades'],
    ['算一下我的GPA', {kind:'recommend', includes:'grades', lang:'zh'}],
    ['我想整理讲义和学习进度', 'study'],
    ['找一些机器人编程练习', 'lab'],
    ['ECE 470 的作业题', 'lab'],
    ['想整理中英文科研术语', 'research'],
    ['论文里的专业词汇怎么记', 'research'],
    ['帮我安排下周的会议', 'calendar'],
    ['我想记账', 'ledger'],
    ['这个月花了多少钱', 'ledger'],
    ['每个月的房租想记下来', 'fixed'],
    ['添加一个待办', 'todos'],
    ['今天想写日记', 'journal'],
    ['记录一下体重', 'health'],
    ['上传我自己的背景音乐', 'music'],
    ['邀请码在哪里兑换', 'access'],
    ['谷歌验证器的验证码', 'totp'],
    ['两步验证', 'totp'],
    ['my pdf prints too dark', {kind:'recommend', includes:'pdf', lang:'en'}],
    ['I need to preview a markdown file with equations', 'markdown'],
    ['remove a person from my photo', 'eraser'],
    ['what score do i need on the final', 'grades'],
    ['calculate my gpa', 'grades'],
    ['where are my lecture notes', 'study'],
    ['robotics coding practice', 'lab'],
    ['translate a research term', 'research'],
    ['schedule a meeting next week', 'calendar'],
    ['track my spending', 'ledger'],
    ['add something to my to-do list', 'todos'],
    ['I want to set up two-factor codes', 'totp'],
    ['upload music', 'music'],
    ['不是PDF，是markdown文档', 'markdown'],
    ['not a pdf, a markdown file', 'markdown'],
    ['你好', {kind:'greet', lang:'zh'}],
    ['hello', {kind:'greet', lang:'en'}],
    ['你是谁', {kind:'self'}],
    ['你能做什么', {kind:'abilities'}],
    ['what can you do', {kind:'abilities', lang:'en'}],
    ['谢谢', {kind:'thanks'}],
    ['bye', {kind:'bye'}],
    ['学习相关', {kind:'category', includes:'grades'}],
    ['文档与图片', {kind:'category', includes:'pdf'}],
    ['今天天气怎么样', {kind:'none'}],
    ['asdfgh', {kind:'none'}],
    ['', {kind:'empty'}],
    ['服务器内存', {kind:'none', excludes:'server-monitor'}],
    ['服务器内存', 'server-monitor', {user:admin}],
    ['服务器内存', {kind:'none', excludes:'server-monitor'}, {user:member}],
    ['rss 订阅', {kind:'none', excludes:'reading'}, {user:member}],
    ['rss 订阅', 'reading', {user:subscriber}],
    ['how do i use the markdown viewer', {kind:'howto', includes:'markdown'}]
  ];
  // Multi-turn conversations: each step is [message, expectation].
  const flows = [
    {name:'how-to follows the last suggestion', steps:[['我想记账', 'ledger'], ['怎么用', {kind:'howto', includes:'ledger'}]]},
    {name:'ordinal picks from a clarification', steps:[['打印讲义想省点墨', {kind:'clarify'}], ['第二个', {kind:'recommend', from:'choices', index:1}]]},
    {name:'"anything else" skips what was shown', steps:[['PDF 太黑', 'pdf'], ['还有别的吗', {kind:'more', excludes:'pdf', includes:'eraser'}], ['还有别的吗', {kind:'moreNone'}]]},
    {name:'more in English', steps:[['my photo has a watermark', 'eraser'], ['anything else?', {kind:'more', excludes:'eraser'}]]}
  ];
  return {single, flows};
});
