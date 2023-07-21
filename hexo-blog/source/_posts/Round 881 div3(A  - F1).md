---
title: Round 881 div3(A  - F1)
date: 2023-07-16
categories:
- acm
tags: 
- codeforces
mathjax : true
---

[题目链接]([Dashboard - Codeforces Round 881 (Div. 3) - Codeforces](https://codeforces.com/contest/1843))

<!--more-->

A. Sasha and Array Coloring

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 1e5 + 10;
int t;
int n;
int a[N];
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        // cout << "--" << endl;
        cin >> n;
        for(int i = 1;i <= n;++i)
            cin >> a[i];
        sort(a + 1,a + 1 + n);
        ll ans =  0;
        for(int i = 1;i <= n / 2;++i)
        {
            ans += a[n - i + 1] - a[i];
        }
        cout << ans << '\n';
    }
}
```

B. Long Long

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 2e5 + 10;
int t;
int n;
ll a[N];
ll cnt_1,sum,cnt_2;
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cnt_1 = 0,sum = 0,cnt_2 = 0;
        cin >> n;
        int i = 1;
        ll cur_sum = 0;
        bool pre_1 = 0;
        bool pre_2 = 0;
        ll x;
        while(n--)
        {
            cin >> x;
            if(x > 0)
            {
                if(pre_1)
                {
                    sum += -1 * cur_sum;
                    cur_sum = 0;
                    cnt_1 ++;
                    pre_1 = 0;
                }
                pre_2 = 1;
                sum += x;
            }
            else if(x == 0)
            {
                continue;
            }else if(x < 0)
            {
                pre_1 = 1;
                if(pre_2)
                {
                    pre_2 = 0;
                    cnt_2 ++;
                }
                cur_sum += x;
            }
        }
        if(cur_sum < 0)
        {
            cnt_1++;
            sum += cur_sum * -1;
            cur_sum = 0;
        }
        cout << sum << " " << cnt_1 << "\n";
    }
}
```

C. Sum in Binary Tree

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 1e5 + 10;
int t;
ll n;
ll ans;
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cin >> n;
        ans = 0;
        ans += n;
        while(n)
        {
            ans += n / 2;
            n /= 2;
        }
        cout << ans << endl;
    }
}
```

D. Apple Tree

图的遍历，注意处理边界条件

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 2e5 + 10;
int t;
ll n,q;
ll ans;
int e[N << 1],ne[N << 1],h[N],idx,g[N];
ll cnt[N];
void add(int a,int b)
{
    e[idx] = b,ne[idx] = h[a] ,h[a] = idx++;
}
bool vis[N];
void dfs(int cur,int fa)
{
    if(g[cur] == 1 && cur != 1)
    {
        cnt[cur] = 1;
    }
    for(int i = h[cur]; i != -1;i = ne[i])
    {
        int j = e[i];
        if(j == fa)
            continue;
        dfs(j,cur);
        cnt[cur] += cnt[j];
    }
} 
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        memset(h,-1,sizeof(h));
        memset(g,0,sizeof(g));
        memset(cnt,0,sizeof(cnt));
        cin >> n;
        for(int i = 1;i < n;++i)
        {
            int u,v;
            cin >> u >>v ;
            add(u,v);
            add(v,u);
            g[u]++,g[v]++;
        }
        dfs(1,0);
        cin >> q;
        for(int i = 1;i <= q;++i)
        {
            int x,y;
            cin >> x >> y;
            cout << cnt[x] * cnt[y] << '\n';
        }
        // for(int i = 1;i <= n;++i)
        //     cout << cnt[i] << " ";
        // cout << "\n";
    }
}
```

E. Tracking Segments

二分之后暴力求解即可

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 1e5 + 10;
int a[N];
int t,n,m,q;
int l[N],r[N];
int cnt[N];
int temp[N];
int x;
bool check(int x)
{
    memset(temp,0,sizeof(temp));
    for(int i = 1;i <= x;++i)
    {
        temp[cnt[i]]++;
    }
    for(int i = 1;i <= n;++i)
        temp[i] += temp[i - 1];
    for(int i = 1;i <= m;++i)
    {
        if(temp[r[i]] - temp[l[i] - 1] > (r[i] - l[i] + 1) / 2)
            return 1;
    }
    return 0;
}
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    { 
        cin >> n >> m;
        for(int i = 1;i <= m;++i)
        {
            cin >> l[i] >> r[i];
        }
        cin >> q;
        memset(cnt,0,sizeof(cnt));
        ll ans = 0;
        for(int i = 1;i <= q;++i)
        {
            cin >> cnt[i];
        }
        int l = 1,r = q + 1;
        while(l < r)
        {
            int mid = l + r >> 1;
            if(check(mid))
            {
                r = mid ;
            }else 
                l = mid + 1;
        }
        if(l == q + 1)
            l = -1;
        cout << l << '\n';
    }
}
```

F1. Omsk Metro (simple version)

由于$u$始终为1，我们只需要维护从起点出发到各个站点的权重范围（由于 $x \in {1,-1}$ ，权重变化一定是连续的)，如果k在这个区间内则成立。

```c++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 2e5 + 10;
int n;
int dp_mx[N],dp_mn[N],mx[N],mn[N];
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    int t;
    cin >> t;
    while(t--)
    {
        cin >> n;
        int cnt = 1;
        memset(dp_mx,-0x3f3f3f3f,sizeof(dp_mx));
        memset(dp_mn,0x3f3f3f3f,sizeof(dp_mn));
        memset(mx,-0x3f3f3f3f,sizeof(mx));
        memset(mn,0x3f3f3f3f,sizeof(mn));
        dp_mx[1] = dp_mn[1] = mx[1] = 1;
        mn[1] = 0;
        for(int i = 1;i <= n;++i)
        {
            char op;
            cin >> op;
            if(op == '+')
            {
                int v,x;
                cin >> v >> x;
                cnt++;
                dp_mx[cnt] = max(dp_mx[v] + x,x);
                dp_mn[cnt] = min(dp_mn[v] + x,x);
                mx[cnt] = max(dp_mx[cnt],mx[v]);
                mn[cnt] = min(dp_mn[cnt],mn[v]);
            }else 
            {
                int u,v,k;
                cin >> u >> v >> k;
                // cout << mx[v] << " " << mn[v] << '\n';
                if(k <= mx[v] && k >= mn[v])
                {
                    cout << "YES" << '\n';
                }else 
                {
                    cout << "NO" << '\n';
                }
            }
        }
    }
}
```

