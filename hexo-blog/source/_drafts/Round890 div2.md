---
title: Round890 div2 （A-C，E1）
categories:
- acm
tags:
- codeforces
mathjax : true
---

[题目链接](https://codeforces.com/contest/1856)

<!--more-->

A. Tales of a Sort

最大答案为所有无序子序列中最大元素

```C++
#include <bits/stdc++.h>
using namespace std;
const int N = 500;
typedef long long ll;
ll a[N];
ll mxn[N];
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    int t;
    cin >> t;
    while(t--)
    {
        int n;
        cin >> n;
        memset(mxn,0,sizeof(mxn));
        bool unsort = 0;
        ll mx = 0;
        vector<int>pos;
        for(int i = 1;i <= n;++i)
        {
            cin >> a[i];
            mx = max(mx,a[i]);
            if(a[i] < a[i - 1])
            {
                unsort = 1;
                pos.push_back(i);
                mxn[i] = mx;
                mx = 0;
            }
        }
        if(!unsort)
        {
            cout << 0 << '\n';
        }else 
        {
            ll ans = 0;
            for(int x:pos)
            {
                ans = max(mxn[x],ans);
            }
            cout << ans << "\n";
        }
    }
}
```

B. Good Arrays

要求 $b_i$ 均为正数，于是考虑什么情况一定会出现 $a_i = b_i$ ，显然只有当 $\sum a[i] < n + cnt[1]$ 时至少出现一个 $a[i] = b[i] = 1$ 

```C++
#include <bits/stdc++.h>
using namespace std;
const int N = 1e5 + 10;
typedef long long ll;
const int MX = 1e9;
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    int t;
    cin >> t;
    while(t--)
    {
        ll n;
        cin >> n;
        vector<ll>a(n + 1);
        int cnt = 0;
        ll sum = 0;
        for(int i = 0;i < n;++i)
        {
            cin >> a[i];
            sum += a[i];
            if(a[i] == 1)
                cnt++;
        }
        if(sum >= n + cnt && n != 1)
        {
            cout << "YES" << '\n';
        }else 
        {
            cout << "NO" << '\n';
        }
    }
}
```

C. To Become Max

二分答案，对于最大值 $x$ ，枚举由哪一位得到，对于最大值 $a[i] = x$ ，最小的花费情况下有 $a[i + j] = x - j$ ，直到某个数不需要操作也满足该条件。

```C++
#include <bits/stdc++.h>
using namespace std;
const int N = 1e3 + 10;
typedef long long ll;
ll a[N];
ll n,k;
bool check(ll x)
{
    for(int i = 1;i <= n;++i)
    {
        int ops = k;
        ll aim = x;
        for(int j = i;j <= n;++j)
        {
            if(a[j] >= aim)
                return 1;
            if(ops < aim - a[j])
                break;
            ops -= aim - a[j];
            aim--;
        }
    }
    return 0;
}
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    int t;
    cin >> t;
    while(t--)
    {
        cin >> n >> k;
        for(int i = 1;i <= n;++i)
        {
            cin >> a[i];
        }
        ll l = 0,r = 1e9;
        while(l < r)
        {
            ll mid = (l + r + 1) >> 1;
            if(check(mid))
            {
                l = mid;
            }else 
            {
                r = mid - 1;
            }
        }
        cout << l << '\n';
    }
}
```

E1. PermuTree (easy version)

由于 $1\leq p_i \leq i$ 那么对于根节点 $u$ ，其同一子树中的点要么全小于 $u$ ，要么全大于 $u$ ，

```C++
#include <bits/stdc++.h>
using namespace std;
const int N = 5050;
typedef long long ll;
int n;
vector<vector<int> >e;
ll sz[N];
ll ans = 0;
void dfs(int u)
{
    bitset<N>dp;
    dp.set(0);
    for(auto son:e[u])
    {
        dfs(son);
        sz[u] += sz[son];
        dp |= dp << sz[son];
    }
    ll tmp = 0;
    for(int i = 0;i <= n / 2;++i)
    {
        if(dp.test(i))
        {
            tmp = max(tmp,1ll * i * (sz[u] - i));
        }
    }
    ans += tmp;
    sz[u] += 1;
}
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> n;
    e.resize(n + 1);
    for(int i = 2;i <= n;++i)
    {
        int x;
        cin >> x;
        e[x].push_back(i);
    }
    dfs(1);
    cout << ans << "\n";
}
```

