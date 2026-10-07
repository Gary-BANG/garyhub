# 把这份说明、FORMAT.md 和作业截图一起交给 AI

请根据我的 ECE 470 作业截图制作 5–10 道练习，输出可导入 ECE 470 Python Lab 的题包。严格遵循随附 FORMAT.md 的 schema_version 1。

1. 英文题干；简要解析中英文结合；使用 NumPy 与 modern_robotics as mr，不使用 scipy、sympy 或 matplotlib。
2. 每题包含唯一 id、version、category、similarity_group、inputs、answers、reference_code、formula_latex、explanation_md；可加 starter_code 与 image。
3. 清楚写明坐标系的表示约定、转换方向、旋转轴所属坐标系、正方向、角度单位和输出变量名/shape。避免 R01 等符号的歧义。
4. 图中坐标、连杆长度、轴位置与图像严格一致，并设为固定输入。只对允许改变的 theta、位移等声明 random。不随机改变旋转矩阵的独立元素。不支持参数联动；避免会产生无效构型的范围。
5. “同类题”是同一模板采样输入。“相似题”是共享 similarity_group 的不同模板，可改变几何图或结构。每个分组至少两道模板。
6. 参考代码接收系统注入的本次输入，计算 answers 指定变量。不要重新定义成默认输入；不要包含网络、文件操作或交互输入。提供默认 expected 并实际核对计算。验证默认与边界参数。
7. 参考代码可读，说明所用公式及使用场景，提示常见 NumPy shape 错误。解释不要把可变答案写死，可用 {{theta}} 占位符。
8. 如需图，生成带轴向、正方向、坐标和尺寸标注的清晰 PNG，与题目逐一核对。用独立文件名 images/<题目id>-v1.png。不要使用图片代替可复制的输入数据。
9. 返回 ZIP，根目录 pack.json，图片位于 images/。如果不能打包，提供合法完整 JSON 和需要的独立图片，不要声称已生成不存在的文件。
10. 单题不要泄露答案到 statement_en、starter_code 或输入数据中。reference_code、公式和解释会在第一次提交之后显示。


## 作业分组与导入约定
每道题可添加 `"assignment": "HW5"`，作业原题及对应变式使用相同作业名称。上传后自动进入右侧“作业练习”，旧题包不填写该字段时显示在“未分组作业”。
默认使用 `import numpy as np` 与 `from modern_robotics import *`，直接调用 `MatrixExp3(...)` 等函数，不加 `mr.`。旧题包中的 `mr` 调用仍兼容。
