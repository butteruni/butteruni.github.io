---
title: HDU 6956（bsgs，hash优化)
date: 2023-07-16
categories:
- acm
tags: 
- math
- hash
mathjax : true
---

[题目链接](https://vjudge.net/problem/HDU-6956)

<!--more-->

定义 $dp_{i}$ 为第 $i$ 次传递后传到Bob手中的方案数，$f_{i}$ 为第 $i$ 次传递到除Bob以外的人的方案数。于是有以下递推式：
$$
dp_{i} = f_{i - 1} \\
f_{i} = (n - 2)f_{i - 1} + (n - 1)dp_{i - 1}\\
	  \ = (n - 2)f_{i - 1} + (n - 1)f_{i - 2}
$$
对第二个式子求得两个特征根：

​		$a = n - 1 \space \space \space \space b = -1$

又有 $f_1 = 0,f_2 = n - 1$

得 $\ f_{i} = \frac{n - 1}{n}((n - 1 )^{i - 1} + (-1)^{i})$

于是问题转化成求最小的 $i$ 使 $dp_{i} = f_{i - 1} \space mod \space998244353 \equiv x $

当 $i$ 为奇数时有 $(n-1)^{i} \equiv x * n - (n - 1)$，偶数时 $(n - 1)^{i} \equiv x * n + (n - 1)$

分奇偶使用bsgs求解

