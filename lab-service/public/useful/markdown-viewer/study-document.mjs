import {LIMITS} from './zip-reader.mjs';

export function studySelection(search) {
  const params = new URLSearchParams(search);
  if (!params.has('studyLecture')) return null;
  const value = {account:params.get('studyAccount'), course:params.get('studyCourse'), lecture:params.get('studyLecture')};
  if (!/^\d+$/.test(value.account || '') || !/^[\w-]{1,90}$/.test(value.course || '') || !/^[\w-]{1,90}$/.test(value.lecture || '')) throw Error('讲义链接无效');
  return value;
}

export async function readStudyDocument(selection, fetcher = fetch) {
  const response = await fetcher('/api/academic/state', {cache:'no-store', credentials:'same-origin'});
  if (!response.ok) throw Error('请使用原账号登录后重新打开讲义');
  const data = await response.json();
  if (String(data.user?.id) !== selection.account) throw Error('登录账号已变化，请从学习中心重新打开讲义');
  const course = data.state?.courses?.find(c => c.id === selection.course);
  const lecture = course?.lectures?.find(l => l.id === selection.lecture);
  if (!lecture || typeof lecture.content !== 'string') throw Error('讲义不存在，请从学习中心重新打开');
  if (new TextEncoder().encode(lecture.content).length > LIMITS.markdown) throw Error('文件过大，Markdown 最多支持 4 MB');
  const images = new Map(); let total = 0;
  for (const asset of course.assets || []) {
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(asset.data || '');
    if (!match || !asset.path || /(?:^|\/)\.\.(?:\/|$)|^\/|\\/.test(asset.path)) continue;
    total += match[2].length;
    if (total > LIMITS.total * 4 / 3) throw Error('讲义配图过大');
    const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
    if (bytes.length <= LIMITS.entry) images.set(asset.path, {type:match[1], bytes});
  }
  return {name:lecture.title, path:lecture.path, documents:new Map([[lecture.path, lecture.content]]), images};
}
