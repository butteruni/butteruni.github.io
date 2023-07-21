---
title: Round 884 div2 && div1(A - D)
date: 2023-07-15
categories:
- acm
tags: 
- codeforces
mathjax : true
---

[题目链接](https://codeforces.com/contest/1844/)

<!--more-->

A Subtraction Game

```C++
#include <bits/stdc++.h>
using namespace std;
int n;
int t,a,b;
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cin >> a >> b;
        if(a > b)
            swap(a,b);
        if(a == 1)
        {
            if(b != 2)
                cout << 2 << endl;
            else 
                cout << 3 << endl;
        }
        else 
            cout << a - 1 << endl;
    }
}
```

B Permutations & Primes

考虑最小未出现的质数，因此应该让尽可能1存在于不同序列中，同时2、3应尽可能不存在于序列中

```c++
#include <bits/stdc++.h>
using namespace std;
const int N = 2e5 + 10;
int n;
int t,a,b;
int main()
{
    cin >> t;
    while(t--)
    {
        cin >> n;
        int temp;
        if(n & 1)
            temp = 2;
        else 
            temp = 3;
        for(int i = 1;i <= n;++i)
        {
            if(i == (n + 1) / 2)
            {
                cout << 1 << " ";
                temp = n;
            }
            else 
            {
                if(i < (n + 1) / 2)
                {
                    cout << temp << " ";
                    temp += 2;
                }
                else 
                {
                    cout << temp << " ";
                    temp -= 2;
                }
            }
        }
        cout << '\n';
    }
}
```

C. Particles

对于序列 $c_1,c_2,...c_n$ 最终结果为部分元素的和，考虑不同删点方式使最后结果最大，先考虑 $c_i > 0$  当 $n = 3$，结果为 $max(c_2,c_1 + c_3)$ ，当$n = 4$ ,结果为 $max(c_1 + c_3,c_2 + c_4)$ 。于是猜测答案为奇数位求和与偶数位求和的最大值，接下来考虑 $c_i < 0$ ,时上述方式能否取得最优解，若$c_i < 0$,为取得最优解应该删去，由于 $c_{i - 1},c_{i + 1}$ 也一并删去，故先删去 $c_i$ ，然后删去$c_{i - 1} + c_{i + 1}$ 即可。对于全为负数情况输出最大值即可。

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 2e5 + 10;
ll c[N];
int n;
int t,a,b;
ll pre[N];
int main()
{
    cin >> t;
    while(t--)
    {
        cin >> n;
        for(int i = 1;i <= n;++i)
            cin >> c[i];
        ll mx = -1e9;
        for(int i = 1;i <= n;++i)
            mx = max(mx,c[i]);
        if(mx < 0)
            cout << mx << '\n';
        else 
        {
            ll ans_1,ans_2;
            ans_1 = 0;ans_2 = 0;
            for(int i = 1;i <= n;++i)
            {
                if(c[i] > 0)
                {
                    if(i & 1)
                        ans_1 += c[i];
                    else 
                        ans_2 += c[i];
                }
            }
            cout << max(ans_1,ans_2) << '\n';
        }
    }
}
```

D Row Major

对给定的 $n$，显然 $n$ 所有的因子都可作为列数进行划分，记列数为 $m$ ，则对于矩阵中元素 $a_i$ ，有 $a_{i + m} \neq a_{i},a_{i + 1} \neq a_{i}$  因此对于初始字符串 $s$ 有 $s[i] \neq s[i + j]$ 其中 `n % j == 0 && (j < n)` ，于是只要找到最小的n的非因数后一直循环即可

```C++
#include <bits/stdc++.h>
using namespace std;
const int N = 2e5 + 10;
int n;
int t,a,b;
int main()
{
    cin >> t;
    while(t--)
    {
        cin >> n;
        int temp = n + 1;
        for(int i = 1;i <= n;++i)
        {
            if(n % i == 0)
            {
                continue;
            }else 
            {
                temp = i;
                break;
            }
        }   
        int cnt = 0;
        while(cnt < n)
        {
            char x = 'a';
            for(int i = 1;i <= temp;++i)
            {
                cout << x;
                x ++;
                cnt++;
                if(cnt == n)
                    break;
            }
        }
        cout << endl;
    }
}
```



后面的有时间再补