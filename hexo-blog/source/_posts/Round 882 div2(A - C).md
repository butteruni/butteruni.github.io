---
title: Round 882 div2(A - C)
date: 2023-07-16
categories:
- acm
tags: 
- codeforces
mathjax : true
---

[题目链接]([Dashboard - Codeforces Round 882 (Div. 2) - Codeforces](https://codeforces.com/contest/1847))

<!--more-->

A. The Man who became a God

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 1010;
int t,n,k;
int a[N];
int mins[N];
int main()
{
    // ios::sync_with_stdio(0);
    // cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cin >> n >> k;
        for(int i = 1;i <= n;++i)
            cin >> a[i];
        for(int i = 1;i < n;++i)
            mins[i] = abs(a[i + 1] - a[i]);
        // for(int i = 1;i <= n;++i)
        //     cout << mins[i] << " ";
        // cout << "\n";
        sort(mins + 1,mins + n);
        ll ans  = 0;
        k--;
        for(int i = n - 1;i >= 1;--i)
        {
            if(k)
                k--;
            else 
                ans += mins[i];
        }
        cout << ans << '\n';
    }
}
```



B. Hamon Odyssey

显然取并后最小结果不为0的情况有且只有一种，结果为0则贪心计算最大方案数

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 2e5 + 10;
int n,t;
ll a[N];
ll mins = 0;
int main()
{
    // ios::sync_with_stdio(0);
    // cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cin >> n;
        for(int i = 1;i <= n;++i)
        {
            cin >> a[i];
        }
        mins = a[1];
        for(int i = 2;i <= n;++i)
            mins &= a[i];
        if(mins != 0)
        {
            cout << 1 << '\n';
        }else 
        {
            int cnt = 0;
            ll temp = a[1];
            for(int i = 2;i <= n;++i)
            {
                if(temp == 0)
                {
                    cnt++;
                    temp = a[i];
                }else 
                    temp &= a[i];
            }
            if(temp == 0)
                cnt++;
            cout << cnt << endl;
        }
    }
}
```

C. Vampiric Powers, anyone?

实际上是求一段最大子段异或和，由于$a_i$很小可以直接记录所有可能值取最大

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 1e5 + 10;
int a[N];
int n,t;
bool vis[300];
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cin >> n;
        ll ans = 0;
        memset(vis,0,sizeof(vis));
        for(int i = 1;i <= n;++i)
        {
            cin >> a[i];
        }
        vis[0] = 1;
        ll temp = 0;
        for(int i = 1;i <= n;++i)
        {
            temp ^= a[i];
            for(int j = 0;j < 256;++j)
            {
                if(vis[j])
                    ans = max(ans,temp ^ j);
            }
            vis[temp] = 1;
        }
        cout << ans << endl;
    }
}
```

