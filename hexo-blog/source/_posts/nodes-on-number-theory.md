---
title: nodes on number theory
tags:
mathjax : true
---

一些关于数论的笔记

#### 因数个数定理

若 $n = p_1^{a_1}p_2^{a_2}p_3^{a_3}...p_m^{a_m}$ ，那么 $n$ 的因数个数 $f(n) = \prod_{i = 1}^m(a_i + 1)$ 

且 $\sum_{x = 1}^nf(x)$ 可转化成：
$$
\sum_{x = 1}^n\sum_{i = 1}^n\sum_{j = 1}^{\lfloor \dfrac{n}{i}\rfloor}[i * j == x] = \sum_{i = 1}^n{\lfloor \dfrac{n}{i}\rfloor}
$$
以 $\sqrt{n}$ 复杂度计算前缀和

#### 莫比乌斯变换

对数论函数 $f(x)，g(x)$ ，若存在 $f(n) = \sum_{d|n}g(d)$，则 $g(n) = \sum_{d|n}μ(d)f(\dfrac{n}{d})$

经典应用：

定义函数 $f(i*j)$ 为 $i * j$ 因数个数，有 $f(ij) = \sum_{x|i}\sum_{y|j}[gcd(x,y) = 1]$ 

同时 
$$
[gcd(i,j) = 1] = \sum_{d|gcd(i,j)} \mu(d)
$$

因此
$$
\begin{aligned}
\sum_{i = 1}^n\sum_{j = 1}^mf(ij) &= \sum_{i = 1}^n\sum_{j = 1}^m\sum_{x|i}\sum_{y|j}[gcd(x,y) = 1]\\
&= \sum_{i = 1}^n\sum_{j = 1}^m\sum_{x|i}\sum_{y|j}\sum_{d|gcd(x,y)}μ(d)\\
&= \sum_{i = 1}^n\sum_{j = 1}^m\sum_{x|i}\sum_{y|j}\sum_{d = 1}^{min(n,m)}μ(d)*[d | gcd(x,y)]\\
&= \sum_{d = 1}^{min(n,m)}\mu(d)\sum_{i = 1}^n\sum_{j = 1}^{m}\sum_{x|i}\sum_{y|j}[d | gcd(x,y)]\\
&= \sum_{d = 1}^{min(n,m)}\mu(d)\sum_{x = 1}^{\lfloor \dfrac{n}{d}\rfloor}\sum_{y = 1}^{\lfloor \dfrac{m}{d}\rfloor}{\lfloor \dfrac{n}{dx}\rfloor}{\lfloor \dfrac{m}{dy}\rfloor}\\
&= \sum_{d = 1}^{min(n,m)}\mu(d)\sum_{x = 1}^{\lfloor \dfrac{n}{d}\rfloor}{\lfloor \dfrac{n}{dx}\rfloor}\sum_{y = 1}^{\lfloor \dfrac{m}{d}\rfloor}{\lfloor \dfrac{m}{dy}\rfloor}\\
\end{aligned}
$$

#### 狄利克雷卷积

对两个数论函数有 $(f * g)(n) = \sum_{d|n}f(d)g(\frac{n}{d})  $

运用：如上

#### 杜教筛

求积性函数 $f(i)$ 前缀和 $S(n) = \sum_{i = 1}^nf(i)$

构造 $h(i) = (f*g)(i)$ 

则有
$$
g(1)S(n) = \sum_{i = 1}^nh(i) - \sum_{d = 2}^ng(d)*S(\frac{n}{d})
$$
