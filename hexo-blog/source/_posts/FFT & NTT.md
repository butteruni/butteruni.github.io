---
title: FFT & NTT
date:
categories:
- acm
tags: 
- math
mathjax : true
---



##### 导言

FFT/NTT在acm竞赛中常被用于处理多项式乘法优化问题，并常常与生成函数等数学内容一同考察，笔者在此整理了一些自己对FFT的理解，希望对读者有所帮助

### 多项式
#### 表达
对于一个在实数域上$n - 1$阶多项式 $f(x)=\sum_{i=0}^{n-1} a_ix^i$ ，要唯一确定这样一个多项式，我们可以使用两种方法，一是如表达式一样使用序列 $a_0, a_1,a_2...a_{n-1}$ 记录$x^i$的系数来唯一确定这一矩阵，记为系数表示法，二可利用[插值多项式唯一性](https://zhuanlan.zhihu.com/p/108166151)的性质通过构造 $n$ 个不同点 $\left(\ x_i,f(x_i)\right)$ 来唯一确定这一多项式，记为点值表示法。

#### 乘法运算

在这里我们重点关注n阶多项式的乘法，考虑两个$n$阶多项式 $f(x)=\sum_{i=0}^{n} a_ix^i$ 和 $g(x)=\sum_{i=0}^{n} b_ix^i$,求乘积$f(x) * g(x)$。直接采用系数表示法暴力相乘可得
 $Q(x) = f(x)*g(x)=\sum_{i=0}^{2n}\sum_{j=0}^{i}a_{j}b_{i-j}x^{i}$ 
记 $Q(x) = \sum_{i=0}^{2n}c_ix^{i}$ ，有$c_i = \sum_{j=0}^{i}a_{j}b_{i-j}$
整体时间复杂度$O(n^2)$

如果使用点值表示法，则可以在已经知道$n + 1$个$\left(\ x_i,f(x_i)\right)$和对应$\left(\ x_i,g(x_i)\right)$的情况下，只需要$O(n)$就可求出目标多项式$f(x)*g(x)$的相关点值，从而唯一确定$Q(x)$,此时$Q(x)$在$x_i$处值为$f(x_i)*g(x_i)$



### 复数的引入



#### 点值的选取
根据上文，点值表示法的优越在于知道点值的情况下可大幅提高运算效率，可如果暴力求点值，每个点 $\left(\ x_i,f(x_i)\right)$ 需要$O(n)$次操作，进而使整体复杂度退化为 $O(n^2)$ ，故使用点值表示法加速多项式乘法的关键在于选取一组特殊点，使得我们能够快速求取多项式在这组点上的对应点值



#### 欧拉公式和复数的单位根



![picture](draw.png)
如图在复平面上，以原点为圆心，半径为 $1$ 构造单位圆，用 $n / 2$ 条过原点直线讲圆$n$等分并交出 $n$ 个点 $w_0,w_1,w_2...w_{n-1}$ 。由欧拉公式 $e^{ix} = \cos x + i\sin x$ 可知,对 $w_i$ 有 $w_k = e^{k \frac{2\pi i}{n}} = \cos (k \frac{2\pi}{n}) + i\sin (k \frac{2\pi}{n})$



##### 单位根的特殊性质

引入复平面的原因就在于单位根 $w_k$ 的一些特殊性质可提高计算效率，这里直接给出，读者往下便可体会到这些性质的作用

性质一：$w_{an}^{ak} = w_{n}^{k}$

性质二:$w_{n}^{k + \frac{n}{2}} = -w_{n}^{k}$

性质三：$w_{n}^{k} = ({w_{n}^{1}})^k$



#### FFT求点值

对 $n - 1$ 阶多项式 $f(x)=\sum_{i=0}^{n-1} a_ix^i$，按下标奇偶分为 $f_1(x)=\sum_{i=0}^{\frac{n-2}{2}} a_{2i}x^{i}$ 和 $f_2(x)=\sum_{i=0}^{\frac{n-2}{2}} a_{2i + 1}x^{i}$ ，显然有 $f(x) = f_1(x ^ 2) + xf_2(x^2)$ ，将 $w_{n}^{k}$、 $w_{n}^{k + \frac{n}{2}}$ 分别代入。
前者得 
$$
f(w_{n}^{k}) = f_1(w_{n}^{k^2}) + w_{n}^{k}f_2(w_{n}^{k^2})
$$
由性质一可化简得 
$$
f(w_{n}^{k}) = f_1(w_{\frac{n}{2}}^{k}) + w_{n}^{k}f_2(w_{\frac{n}{2}}^{k})
$$
记为$\alpha$。
后者代入得
$$
f(w_{n}^{k + \frac{n}{2}}) = f_1(w_{n}^{2k + n}) + w_{n}^{k + \frac{n}{2}}f_2(w_{n}^{2k + n})
$$
由性质二化简得
$$
f(w_{n}^{k + \frac{n}{2}}) = f_1(w_{\frac{n}{2}}^{k}) - w_{n}^{k}f_2(w_{\frac{n}{2}}^{k})
$$
记为$\beta$​。

由 $\alpha$ 和 $\beta$ 可知求解 $f(w_n^k)$ 的问题最终可以层层递归至求
 $f_1(w_1^k) = f_2(w_1^k) = 1$ 
故可以用 $O(log(n))$ 的复杂度求出 $f(w_n^k)$ 和 $f(w_{n}^{k + \frac{n}{2}})$ ，最终可以用$O(nlog(n))$的复杂度求出所有 $f(w_n^k)$



##### 蝴蝶变换



考虑到每次拆分函数都会使用大量空间和时间，因此考虑优化此过程
对于系数序列 $A(x) = /sum_{i=0}^{n - 1}a_i (n = 2^k，不足则高位补0)$ ，手动操作FFT拆分函数的过程不难发现，对于系数$a_i$，记其经过全部拆分后的位置为$i^{-1}$
始终有 $S(i^{-1}) = reverse(S(i))$ ，其中$S(i)$为$i$的二进制表示字串。因此我们可直接算出最终系数使时间复杂度真正成为$O(nlog(n))$
对于二进制长度为$l$的数$x$,尝试求其二进制反转后的数 $r(x)$，显然0反转后仍为0，1反转后为$2^l$,对于$x > 1$,有 $r(x) = (r(x >> 1) >> 1) + (x \space mod \space 2)2^l$ ，即可递推求出全部 $r(x)$



#### 傅里叶逆变换（IDFT）



现在我们得到了 $Q(x)$ 的点值表示，需要将点值表示转化为系数表示。

使用矩阵表示FFT的过程，得到

$$\left[
\begin{matrix}
 1      & 1         & 1     &\cdots & 1      \\
 1      & w_n^1     & w_n^2 & \cdots & w_n^{n-1}      \\
 1      & {(w_n^1)}^2 & {(w_n^2)}^2      & \cdots & {(w_n^{n-1})}^2      \\
 \vdots & \vdots    &\vdots  & \ddots & \vdots \\
 1      & {(w_n^1)}^{n-1} &{(w_n^2)}^{n-1} & \cdots & {(w_n^{n-1})}^{n-1}      \\
\end{matrix}
\right]
\left[
\begin{matrix}
 a_0            \\
 a_1            \\
 a_2            \\
 \vdots         \\
 a_{n-1}        \\
\end{matrix}
\right]=
\left[
\begin{matrix}
 f(w_0)             \\
 f(w_1)             \\
 f(w_2)             \\
 \vdots             \\
 f(w_{n-1})         \\
\end{matrix}
\right]$$

不妨记为$VA = Y$，要得到$A$,只需要在等式左右两行左乘$V^{-1}$

在实际进行矩阵运算之前，不妨回到$w_n^k$的一些性质，由性质三可知，$w_n^n = w_n^0 = 1 = (w_n^1)^k$
考察公式 $x^n - 1 = 0$ 
因式分解得 $(x-1)(x^{n-1} + x^{n-2} + ... +x) = 0$ 
当 $x!=1$ 时，有 $x^{n-1} + x^{n-2} + ... +x = 0$ ，即 $\sum_{i=1}^{n-1} w_n^i = 0$ 
更进一步，有
$$
\left[
\begin{matrix}
 1      & (w_n^{n-i})^1  & (w_n^{n-i})^2&\cdots & (w_n^{n-i})^{n-1} 
\end{matrix}
\right]
\left[
\begin{matrix}
 1            \\
 (w_n^{j})^1   \\
 (w_n^{j})^2    \\
 \vdots         \\
 (w_n^{j})^{n-1}    \\
\end{matrix}
\right]
=\sum_{k=0}^{n-1}(w_n^{n-i})^k(w_n^j)^{k} =\sum_{k=0}^{n-1}(w_n^{n-i+j})^{k}
=\begin{cases}
\ 0, & i!=j \\
\ n, & i=j \\
\end{cases}
$$
由此构造矩阵
$V_{-1} = 
\left[
\begin{matrix}
 1      & 1         & 1     &\cdots & 1      \\
 1      & {(w_n^{n-1})}^{1} &{(w_n^{n-1})}^{2} & \cdots & {(w_n^{n-1})}^{n-1}      \\
 1      & {(w_n^{n-2})}^{1} &{(w_n^{n-2})}^{2} & \cdots & {(w_n^{n-2})}^{n-1}      \\
 \vdots & \vdots    &\vdots  & \ddots & \vdots \\
 1      & w_n^1     & (w_n^1)^2 & \cdots & (w_n^1)^{n-1}
 \end{matrix}
\right]$
可得 $V_{-1}V = nE$
即 $V_{-1} = nV^{-1}$

$$\left[
\begin{matrix}
 a_0            \\
 a_1            \\
 a_2            \\
 \vdots         \\
 a_{n-1}        \\
\end{matrix}
\right]=
\left[
\begin{matrix}
 1      & 1         & 1     &\cdots & 1      \\
 1      & {(w_n^{n-1})}^{1} &{(w_n^{n-1})}^{2} & \cdots & {(w_n^{n-1})}^{n-1}      \\
 1      & {(w_n^{n-2})}^{1} &{(w_n^{n-2})}^{2} & \cdots & {(w_n^{n-2})}^{n-1}      \\
 \vdots & \vdots    &\vdots  & \ddots & \vdots \\
 1      & w_n^1     & (w_n^1)^2 & \cdots & (w_n^1)^{n-1}
 \end{matrix}
\right]
\left[
\begin{matrix}
 f(w_0)             \\
 f(w_1)             \\
 f(w_2)             \\
 \vdots             \\
 f(w_{n-1})         \\
\end{matrix}
\right]
$$

故对傅里叶变换后的多项式在做一次选取根为 $w_n^{-k}$ 的傅里叶变换即可获得原多项式



##### FFT模板



### NTT



由于FFT中存在复数和大量的三角函数运算且不支持取模，在整数域内取点的NTT应运而生，FFT的加速运用了复数单位根的性质，同样,NTT选取的根也应当具有类似性质。



#### 原根



前置知识：[欧拉函数](https://zhuanlan.zhihu.com/p/108422764),[欧拉定理](https://oi-wiki.org/math/number-theory/fermat/)
对一对互质正整数 $a,p$ ，且$p > 1$
设满足 $a^n \equiv 1(mod \space p)$ 的最小n为a模p的阶，记为$\delta_p(a)$。
对所有 $0 <= i <= n$ ，所有 $a^i \space mod\space p$ 结果不同，
证明:不妨设存在 $0 < i < j < n$ 使 $a^i \equiv a^j (mod \space p)$
则有 $a^{j-i} \equiv 1 (\space mod \space p)$ ，与阶定义矛盾

对正整数 $p$ ，若 $a$ 模 $p$ 的阶 $\delta_p(a) = \varphi(p)$ 且 $gcd(a,p) = 1$ ，则称 $a$ 为 $p$ 的一个原根，注意 $\varphi(p)$ 为 $p$ 欧拉函数
对正整数$p$,整数$a$为其原根的充要条件为 $gcd(a,p) = 1$ 且 $S=\{a^1,a^2,a^3,...,a^{\varphi(p)}\}$ 为$p$的一组[剩余化简系](https://www.cnblogs.com/olderciyuan/p/15500681.html#:~:text=%E5%AE%9A%E4%B9%89%20%E7%BB%99%E5%AE%9A%E4%B8%80%E4%B8%AA%E6%AD%A3%E6%95%B4%E6%95%B0%20n%20%EF%BC%8C%E6%9C%89%20%CF%86%20%28n%29%20%E4%B8%AA%E4%B8%8D%E5%90%8C%E7%9A%84%E3%80%81%E6%A8%A1%20n,%CF%86%20%28n%29%20%E4%B8%AA%E5%89%A9%E4%BD%99%E7%B1%BB%E4%B8%AD%E5%90%84%E5%8F%96%E5%87%BA%E4%B8%80%E4%B8%AA%E5%85%83%E7%B4%A0%EF%BC%8C%E6%80%BB%E5%85%B1%20%CF%86%20%28n%29%20%E4%B8%AA%E6%95%B0%EF%BC%8C%E5%B0%86%E8%BF%99%E4%BA%9B%E6%95%B0%E6%9E%84%E6%88%90%E4%B8%80%E4%B8%AA%E6%96%B0%E7%9A%84%E9%9B%86%E5%90%88%EF%BC%8C%E5%88%99%E7%A7%B0%E8%BF%99%E4%B8%AA%E9%9B%86%E5%90%88%E4%B8%BA%E6%A8%A1%20n%20%E7%9A%84%E7%AE%80%E5%8C%96%E5%89%A9%E4%BD%99%E7%B3%BB%E3%80%82)，由阶的性质和原根定义可直接证明

对质数 $q = p2^n + 1$ ，存在原根$g$
设 $g_n = g^{\frac{q-1}{n}}$ 有$g_n^n = g_n^{n\frac{q-1}{n}} = g_n^{q-1}$ ， $g_{an}^{ak} = g_n^{\frac{k(q-1)}{n}} = g_n^k$ 

对 $\{g_n^1,g_n^2,...,g_n^n\}$ 存在如下性质：

性质一：$g_n^n \equiv 1 (mod \space q)$
性质二：$g_n^{\frac{n}{2}} \equiv -1 (mod \space q)$
性质三：$(g_n^{k + \frac{n}{2}})^2 = g_n^{2k + n} \equiv g_n^{2k} (mod \space q)$
其中性质一可直接由原根性质得出，下面给出性质二和三的证明
性质二：
对 $g_n^{\frac{n}{2}}$ ，由 $g_n$ 定义可得 $g_n^{\frac{n}{2}} = g_n^{\frac{q-1}{2}}$ 又 $(g_n^{\frac{q-1}{2}})^2 = g_n^{(q-1)} \equiv 1(mod \space q)$ 同时，根据原根定义有 $g_n^{\frac{q-1}{2}} != g_n^{(q-1)} \equiv 1(mod \space q)$故得 $g_n^{\frac{n}{2}} = g_n^{\frac{q-1}{2}} \equiv -1 (mod \space q)$ 
性质三：

 $g_n^{k + \frac{n}{2}} = g_n^{k} * g_n^{\frac{n}{2}} = -g_n^{k}$ 
 $(g_n^{k + \frac{n}{2}}) ^ 2 = (-g_n^k) ^ 2 = g_n^{2k}$
将原根和单位根对比，不难发现原根具有与单位根相似性质，因此原本通过代入 $w_n^k$ 的FFT就可以通过换成代入 $g_n^k$ 变成NTT，最后逆变换的过程则可以视为代入 $w_n^k$ 在$mod \space q$下的逆元

关于原根的求取，一般采用直接枚举。



#### 模板
```C++
#include <bits/stdc++.h>
typedef long long ll;
const int N = 4000000 + 100, g = 3, invg = 332748118, mod = 998244353;
//998244353的一个原根为3且998244353-1=2^23*119，3在模998244353意义下的逆元为332748118
using namespace std;
int n, m, r[N]; //rev[i]为i的二进制翻转
long long a[N], b[N];
ll qpow(ll a, ll k) //快速幂，a为底数，k为指数
{
    ll res = 1;
    while (k)
    {
        if (k & 1)
            res = res * a % mod;
        a = a * a % mod;
        k >>= 1;
    }
    return res;
}
void NTT(ll *a,int type,int len)
{
    for(int i = 0;i < len;++i)
        if(i < r[i])
            swap(a[i],a[r[i]]);
    for(int mid = 1;mid < len;mid <<= 1)
    {
        ll wn = 1;
        if(type == 1)
            wn = qpow(g,(mod - 1) / (mid << 1));
        else
            wn = qpow(invg,(mod - 1) / (mid << 1));
        for(int i = 0;i < len;i += (mid << 1))
        {
            for(int j = 0,w0 = 1;j < mid;++j,w0 = 1ll * w0 * wn % mod)
            {
                ll x = a[i + j], y = w0 * a[i + j + mid] % mod;
                a[i + j] = (x + y) % mod;
                a[i + j + mid] = (x - y + mod) % mod; 
            }
        }
    }
}
int main()
{
    string s1,s2;
    cin >> s1 >> s2;
    // cout << s1 << endl << s2 << endl;
    n = s1.length() - 1;
    m = s2.length() - 1;
    for(int i = 0;i <= n;++i)
        a[i] = s1[n - i] - '0';
    for(int i = 0;i <= m;++i)
        b[i] = s2[m - i] - '0';
    int len = 1 << max((int)ceil(log2(n + m)), 1);
    for(int i = 0;i < len;++i)
        r[i] = (r[i >> 1] >> 1) | ((i & 1) << (max((int)ceil(log2(n + m)), 1) - 1));
    NTT(a,1,len),NTT(b,1,len);
    for(int i = 0;i < len;++i)
        a[i] = a[i] * b[i] % mod;
    NTT(a,-1,len);
    ll inv = qpow(len,mod-2);
    for (int i = 0; i <= len; i++)
        a[i] = a[i] * inv % mod;
    for (int i=0; i < len; i++)
    {
        if (a[i]>=10) 
        {
            a[i+1] += a[i] / 10; 
            a[i] %= 10;
        }
    }
    while(!a[len] && len) len--;
    while(a[len] >= 10)
    {
        a[len + 1] += a[len] / 10;
        a[len++] %= 10;
    }
    for(int i = len;i >= 0;--i)
        cout << a[i];
    return 0;	
}
```

### 练习
[P1919 【模板】A*B Problem 升级版（FFT 快速傅里叶变换）](https://www.luogu.com.cn/problem/P1919)

[P3803 【模板】多项式乘法（FFT）](https://www.luogu.com.cn/problem/P3803)

[2020中国大学生程序设计竞赛（CCPC） - 网络选拔赛 M - Residual Polynomial](https://vjudge.net/contest/556753#problem/M)

[CF1824B2](https://codeforces.com/contest/1825/problem/D2)