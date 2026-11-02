#!/usr/bin/env python3
"""Aggregate-only GSC + GA4 reporting via short-lived OIDC credentials."""
import json
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
from urllib.parse import quote
import google.auth
from google.auth.transport.requests import AuthorizedSession

SCOPES=["https://www.googleapis.com/auth/webmasters.readonly","https://www.googleapis.com/auth/analytics.readonly"]
creds,_=google.auth.default(scopes=SCOPES)
session=AuthorizedSession(creds)
def post(url, payload):
    r=session.post(url,json=payload,timeout=30)
    if r.status_code>=400:
        raise RuntimeError("Google API HTTP %s from %s" % (r.status_code, url.split('/')[2]))
    return r.json()
yesterday=date.today()-timedelta(days=3)
start=yesterday-timedelta(days=27)
dates={"startDate":start.isoformat(),"endDate":yesterday.isoformat()}
report={"generated_utc":datetime.now(timezone.utc).isoformat(),"search_console":{},"ga4":{}}
sc_url="https://searchconsole.googleapis.com/webmasters/v3/sites/"+quote("sc-domain:archelaos.club",safe="")+"/searchAnalytics/query"
sc=post(sc_url,{**dates,"dimensions":["date"],"rowLimit":60})
rows=sc.get("rows",[])
report["search_console"]={"range":dates,"daily":[{"date":r["keys"][0],"clicks":r.get("clicks",0),
 "impressions":r.get("impressions",0),"ctr":r.get("ctr",0),"position":r.get("position",0)}
 for r in rows if r.get("keys") and len(r["keys"])==1]}
ga=post("https://analyticsdata.googleapis.com/v1beta/properties/510627658:runReport",
 {"dateRanges":[{"startDate":start.isoformat(),"endDate":yesterday.isoformat()}],
 "dimensions":[{"name":"date"}],"metrics":[{"name":"activeUsers"},{"name":"sessions"},{"name":"screenPageViews"}],"limit":50})
daily=[]
for row in ga.get("rows",[]):
    dims=row.get("dimensionValues",[])
    vals=row.get("metricValues",[])
    if len(dims)==1 and len(vals)==3:
        daily.append({"date":dims[0].get("value"),"activeUsers":int(vals[0]["value"]),
           "sessions":int(vals[1]["value"]),"pageViews":int(vals[2]["value"])})
report["ga4"]={"range":dates,"daily":daily}
path=Path("google-analytics-aggregate.json")
path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print("Wrote Google aggregate statistics (%s GSC days, %s GA4 days). No visitor identifiers."%(len(rows),len(daily)))
