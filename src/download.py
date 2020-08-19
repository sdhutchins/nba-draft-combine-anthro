# -*- coding: utf-8 -*-
import pandas as pd
import requests
import json
from time import sleep

url = "https://stats.nba.com/stats/draftcombineplayeranthro?LeagueID=00&SeasonYear={year}"

HEADERS = {
        'user-agent': ('Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36'), # noqa: E501
        'Dnt': ('1'),
        'Accept-Encoding': ('gzip, deflate, sdch'),
        'Accept-Language': ('en'),
        'origin': ('http://stats.nba.com')
        }

years = ["2001-02", "2002-03", "2003-04", "2004-05", "2005-06", "2006-07",
         "2007-07", "2008-09", "2009-10", "2010-11", "2011-12", "2012-13",
         "2013-14", "2014-15", "2015-16", "2016-17", "2017-18", "2018-19",
         "2019-20"]

dfs = []

for year in years:
    u = url.format(year=year)
    response = requests.get(u, headers=HEADERS)
    data = json.loads(response.text)
    headers = data['resultSets'][0]['headers']
    anthro_data = data['resultSets'][0]['rowSet']
    df = pd.DataFrame(anthro_data, columns=headers)
    dfs.append(df)
    print("%s anthro data added." % year)
    sleep(40)

all_data = pd.concat(dfs)

cols_to_remove = ['TEMP_PLAYER_ID', 'PLAYER_NAME', 'HEIGHT_WO_SHOES',
                  'HEIGHT_W_SHOES', 'WINGSPAN', 'STANDING_REACH']

all_data = all_data.drop(cols_to_remove, axis=1)

all_data.to_csv("../data/anthro_data.csv", index=False)
