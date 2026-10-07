# ECE 470 Python Lab · Question pack format v1

## 文件
无图题：上传 JSON。含图题：上传 ZIP，根目录 pack.json，图片在 images/ 下。支持 PNG/JPEG/WebP，不支持 SVG。每张图片最多 5 MB，题包最多 25 MB，最多 100 个模板。不要把文件放在额外的一层目录内。

示例题包包含 12 个完整模板，可直接复制修改。所有问题、数据、公式与解释由上传者提供；应用不会调用 AI。

## 最小完整例子
```json
{
  "schema_version": 1,
  "title": "Rotations practice",
  "problems": [{
    "id": "my-rotation-z",
    "version": 1,
    "title": "Rotation about the z axis",
    "category": "Rotations",
    "similarity_group": "my-axis-angle",
    "statement_en": "Frame 1 rotates by theta radians about the fixed z axis of frame 0. Find R01. Return a (3, 3) matrix.",
    "inputs": {
      "axis": {"type": "array", "value": [0, 0, 1]},
      "theta": {"type": "scalar", "value": 0, "random": {"min": -3, "max": 3, "step": 0.1, "unit": "rad"}}
    },
    "answers": [{"name": "R01", "shape": [3, 3], "rtol": 0.00001, "atol": 0.0000001, "expected": [[1,0,0],[0,1,0],[0,0,1]]}],
    "reference_code": "R01 = MatrixExp3(VecToso3(axis * theta))",
    "formula_latex": "R_{01}=e^{[\\hat\\omega]\\theta}",
    "explanation_md": "先把旋转向量转换成反对称矩阵。Use VecToso3 before MatrixExp3.",
    "starter_code": "# Assign your result to R01.\n"
  }]
}
```

## 字段说明
- schema_version 固定为 1；title 是题包名称。
- id：稳定的唯一小写标识，只用 a–z、0–9、连字符、下划线；以字母或数字开头。
- version：正整数。更新已有 id 时必须增大版本；练习记录保留原题快照。
- title / category：英文标题与分类。
- similarity_group：相似题分组；相同字符串的不同模板可以互相切换。
- statement_en：英文题干，支持 Markdown / LaTeX。不应把可变数值写死；用变量名或 {{theta}} 占位符。
- inputs：键为合法 Python 变量名，不能使用 np / mr / Python 关键字。禁止以 _ 开头。
- type：array（NumPy 数组）、scalar（数值标量）、integer（整数）。array 会转换成 np.array(value, dtype=float)。value 必须是有限数值或规则嵌套数组。
- 没有 random 的输入永远固定。有 random 时：min / max / step / unit 必填，min < max，step > 0。从 min 起按 step 离散均匀采样，最多不超过 max。数组每个元素独立采样；不支持参数之间的依赖约束。默认 value 须在范围内。
- 对图题：所有图中坐标、轴和连杆长度必须放在固定输入中；只给允许改变的 theta 等声明 random。不要随机生成独立矩阵元素来构造旋转矩阵；应随机角度并在代码中构造合法旋转。
- answers：一个或多个必须输出的变量。shape [] 代表标量，[3] 代表 (3,)，[3,1] 代表列向量，[4,4] 代表齐次变换。答案变量不能与输入同名。rtol / atol 非负，按 abs(actual-expected) <= atol + rtol * abs(expected) 判断。
- expected：默认 value 对应的参考数值，建议提供。导入时与参考代码交叉检查；变式的答案由 reference_code 重新计算，不使用默认 expected。
- reference_code：由系统先注入 import numpy as np、from modern_robotics import * 和本次 inputs，再执行此代码。必须赋值 answers 指定的所有变量。不要重新写死输入、不要随机生成值、不要 input()、不要联网。参考代码需在整个参数范围内成立。
- formula_latex：纯 LaTeX 字符串，不加 $$；JSON 中每个反斜杠必须写作 \\。
- explanation_md：预先写好的中英文说明，支持 Markdown 和 $...$ / $$...$$。可用 {{theta}} 等输入占位符。说明尽量保持符号形式，不要写死随参数改变的答案。
- starter_code：可选，追加在输入代码之后的初始代码。不要包含答案。
- image：可选，例如 images/my-rotation-v1.png，对应 ZIP 内同名文件。每个题目/版本使用独立文件名。

## 执行与保存
运行环境为 Python 3.12、NumPy 2.0.2、Modern Robotics。每次使用新的变量命名空间，参考代码与用户代码使用独立解释器。10 秒执行超时可停止，不提供 scipy/sympy/matplotlib。导入会执行参考代码，请只导入你信任的内容。随机预检不是数学证明，应自行确认参数边界与题意。

第一次“提交”后，无论结果如何，公式与解析都会显示；Python 环境无法启动时数值答案可能暂不可用，重新提交即可重试。“运行”不会解锁。新同类/相似题重新隐藏解析。

浏览器 IndexedDB 保存题目、草稿、参数实例与最近 1000 次提交。备份包括练习状态，题库导出只包括模板和图片。清理浏览器会删除本地记录。

## 分发与更新
上传新增模板或提高 version 的模板即可更新，无须重新部署网站。JSON 无法携带新的图片；有新图片请用 ZIP。完整备份恢复会替换当前题库/练习记录，恢复前可先导出当前备份。


## 作业分组与导入约定
每道题可添加 `"assignment": "HW5"`，作业原题及对应变式使用相同作业名称。上传后自动进入右侧“作业练习”，旧题包不填写该字段时显示在“未分组作业”。
默认使用 `import numpy as np` 与 `from modern_robotics import *`，直接调用 `MatrixExp3(...)` 等函数，不加 `mr.`。旧题包中的 `mr` 调用仍兼容。
