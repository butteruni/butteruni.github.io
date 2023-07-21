---
title: Round 883 div3(A - E，G)
date: 2023-07-16
categories:
- acm
tags: 
- codeforces
mathjax : true
---



[题目链接](https://codeforces.com/contest/1846/) 

<!--more-->

A. Rudolph and Cut the Rope

```C++
#include <bits/stdc++.h>
using namespace std;
const int N = 1010;
int n;
int t;
int a[N],b[N];
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cin >> n;
        for(int i = 1;i <= n;++i)
            cin >> a[i] >> b[i];
        int cnt = 0;
        for(int i = 1;i <= n;++i)
        {
            if(b[i] < a[i])
                cnt++;
        }
        cout << cnt << endl;
    }
}
```

B. Rudolph and Tic-Tac-Toe

纯码力题

```c++
#include <bits/stdc++.h>
using namespace std;
const int N = 1010;
int n;
int t;
char a[5][5];
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        for(int i = 1;i <= 3;++i)
        {
            for(int j = 1;j <= 3;++j)
            {
                cin >> a[i][j];
            }
        }
        bool success = 0;
        char ans;
        for(int i = 1;i <= 3;++i)
        {
            if(success)
                break;
            for(int j = 1;j <= 3;++j)
            {
                if(j == 3)
                {
                    ans = a[i][j];
                    if(ans != '.')
                        success = 1;
                }
                if(a[i][j + 1] != a[i][j])
                    break;
            }
        }
        for(int i = 1;i <= 3;++i)
        {
            if(success)
                break;
            for(int j = 1;j <= 3;++j)
            {
                if(j == 3)
                {
                    ans = a[j][i];
                    if(ans != '.')
                        success = 1;
                }
                if(a[j + 1][i] != a[j][i])
                    break;
            }
        }
        for(int i = 1;i <= 3;++i)
        {
            if(success)
                break;
            if(i == 3)
            {
                ans = a[i][i];
                if(ans != '.')
                    success = 1;
            }
            if(a[i][i] != a[i + 1][i + 1])
            {
                break;
            }
        }
        for(int i = 1;i <= 3;++i)
        {
            if(success)
                break;
            if(i == 3)
            {
                ans = a[i][4 - i];
                if(ans != '.')
                    success = 1;
            }
            if(a[i][4 - i] != a[i + 1][3 - i])
            {
                break;
            }
        }
        if(success)
        {
            if(ans == '.')
                cout << "DRAW" << endl;
            else 
                cout << ans << endl;
        }
        else 
            cout << "DRAW" << endl;
    }

}
```

C. Rudolf and the Another Competition

简单贪心

```c++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 2e5 + 10;
int h,n,m,t;
struct node
{
    ll point;
    ll penalty;
    bool s;
}a[N];
bool cmp(node x,node y)
{
    if(x.point != y.point)
    {
        return x.point > y.point;
    }else if(x.penalty != y.penalty)
    {
        return x.penalty < y.penalty;
    }else 
    {
        return x.s > y.s;
    }
}
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cin >> n >> m >> h;
        memset(a,0,sizeof(a));
        vector<vector<int> >po;
        po.resize(n + 1);
        for(int i = 1;i <= n;++i)
        {
            po[i].resize(m);
            for(int j = 0;j < m;++j)
            {
                cin >> po[i][j];
            }
        }
        for(int i = 1;i <= n;++i)
        {
            sort(po[i].begin(),po[i].end());
            for(int j = 1;j < m;++j)
                po[i][j] += po[i][j - 1];
            int pos = 0;
            while(po[i][pos] <= h && pos < m)
            {
                a[i].point++;
                a[i].penalty += po[i][pos];
                pos++;
            }
            if(i == 1)
                a[i].s = 1;
        }
        sort(a + 1,a + 1 + n,cmp);
        // for(int i = 1;i <= n;++i)
        // {
        //     cout << i << " " << a[i].point << " " << a[i].penalty << endl;
        // }
        for(int i = 1;i <= n;++i)
        {
            if(a[i].s)
            {
                int pos = i;
                while(a[pos].point == a[i].point && a[i].penalty == a[pos].penalty&&pos>0)
                    pos--;
                cout << pos+1 << endl;
                break;
            }
        }
    }
}
```

D. Rudolph and Christmas Tree

```C++
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const int N = 2e5 + 10;
int t,n;
double d,h;
ll y[N]; 
int main()
{
    cin >> t;
    while(t--)
    {
        cin >> n >> d >> h;
        for(int i = 1;i <= n;++i)
            cin >> y[i];
        double ans = 0;
        for(int i = 1;i <= n;++i)
        {
            if(y[i + 1] - y[i] >= h || i == n)
            {
                ans += d * h / 2;
            }else 
            {
                double temp_h = y[i + 1] - y[i];
                double upper = (1.0 - temp_h / h) * d;
                // cout << upper << " ";
                ans += (upper + d) / 2 * temp_h; 
                // cout << ans << " ";
            }
        }
        printf("%lf\n",ans);
    }
}
```

E. Rudolf and Snowflakes

easy version可以map暴力，hard version枚举次数后二分底数

```
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const ll MX = 1e18;
int t;
ll n;
void check(ll x)
{
    for(int i = 2;i <= 62;++i)
    {
        ll l = 2,r = 1e9;
        while(l < r)
        {
            ll mid = (l + r) >> 1;
            ll sum = 0,m = 1;
            bool over = 0;
            for(int j = 0;j <= i;++j)
            {
                if(MX - sum < m)
                {
                    over = 1;
                    break;
                }
                sum += m;
                if(MX / m < mid && j < i)
                {
                    over = 1;
                    break;   
                }
                m *= mid;
            }
            if(sum == x)
            {
                cout << "YES" << endl;
                return;
            }else if(sum > x || over)
            {
                r = mid;
            }else if(sum < x)
            {
                l = mid + 1;
            }
        }
    }
    cout << "NO" << endl;
}
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cin >> n;
        check(n);
    }
}
```

G. Rudolf and CodeVid-23

可以看作最短路模型，每种药可看作两种状态之间费用为1的通路，建完图后Dijkstra即可

```C++
#include <bits/stdc++.h>
using namespace std;
typedef pair<int,int> PII;
const int N = 1 << 10;
int dis[N];
int t,n,m;
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0),cout.tie(0);
    cin >> t;
    while(t--)
    {
        cin >> n >> m;
        memset(dis,0x3f,sizeof(dis));
        bitset<10> tmp;
        cin >> tmp;
        int st = (int)tmp.to_ulong();
        vector<pair<PII,int> > edge;
        edge.resize(m + 1);
        for(int i = 1;i <= m;++i)
        {
            cin >> edge[i].second;
            cin >> tmp;
            edge[i].first.first = ((1 << n) - 1) ^ (int)(tmp.to_ulong());
            cin >> tmp;
            edge[i].first.second = (int)(tmp.to_ulong());
        }
        dis[st] = 0;
        set<PII> q ;
        q.insert({0,st});
        while(q.size())
        {
            auto temp = *q.begin();
            q.erase(temp);
            for(int i = 1;i <= m;++i)
            {
                int ne = temp.second & edge[i].first.first;
                ne |= edge[i].first.second;
                if(dis[ne] > temp.first + edge[i].second)
                {
                    q.erase({dis[ne],ne});
                    dis[ne] = temp.first + edge[i].second;
                    q.insert({dis[ne],ne});
                }
            }
        }
        if(dis[0] > 1e8)
            cout << "-1" << '\n';
        else 
            cout << dis[0] << '\n';
    }
    // cout << endl;
}
```

