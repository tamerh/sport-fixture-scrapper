/**
 *
 */
const puppeteer = require('puppeteer');
var fs = require('fs-extra')
const headlessChrome = false;
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdays2 = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];


let page;
const dayAhead=6;
const today = new Date();
const processDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayAhead);
const month = processDate.getMonth();
const day = processDate.getDate();
const year = processDate.getFullYear();
const weekday = weekdays[processDate.getDay() - 1];
const weekday2 = weekdays2[processDate.getDay() - 1];
const dateSB = day + "/" + (month + 1) + " " + weekday;
const dateSB2 = day + "/" + (month + 1) + " " + weekday2;
const localToUtc= new Map();


(async () => {

  try {

    const browser = await puppeteer.launch({
      headless: headlessChrome
    })
    page = await browser.newPage()
    page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36");
    page.setViewport({
      width: 1400,
      height: 800,
      deviceScaleFactor: 2
    });


    fs.removeSync('result')
    fs.mkdirSync("result")

    let result={};

    await init("football","https://www.scoreboard.com/uk/football/","https://www.livescore.in/",sbTemplate1,".soccer table",result)
    await init("basketball","https://www.scoreboard.com/uk/basketball/","https://www.livescore.in/basketball/",sbTemplate2,".table-main > .basketball",result)
    await init("tennis","https://www.scoreboard.com/uk/tennis/","https://www.livescore.in/tennis/",sbTemplate2,".table-main > .tennis",result)
    await init("hockey","https://www.scoreboard.com/uk/hockey/","https://www.livescore.in/hockey/",sbTemplate2,".table-main > .hockey",result)
    await init("cricket","https://www.scoreboard.com/uk/cricket/","https://www.livescore.in/cricket/",sbTemplate2,".table-main > .cricket",result)
    await init("amfootball","https://www.scoreboard.com/uk/american-football/","https://www.livescore.in/american-football/",sbTemplate2,".table-main > .american-football",result) 
    await init("handball","https://www.scoreboard.com/uk/handball/","https://www.livescore.in/handball/",sbTemplate2,".table-main > .handball",result) 
    await init("volleyball","https://www.scoreboard.com/uk/volleyball/","https://www.livescore.in/volleyball/",sbTemplate2,".table-main > .handball",result) 
    await init("rugby-union","https://www.scoreboard.com/uk/rugby-union/","https://www.livescore.in/rugby-union/",sbTemplate2,".table-main > .rugby-union",result)
    // TODO field hockey,rugby-league,esports,aussie rules,
    /** */
   

   fs.writeJSONSync("result/result.json", result)

    await browser.close()
  } catch (e) {
    //TODO try again in few minutes
    console.trace("My error" + e.stack)
    process.exit()
  }

})()

function getUTC(time){

  if(localToUtc.has(time)){
      return localToUtc.get(time);
  }else{
      let tmpDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayAhead)
      tmpDate.setHours(time.split(":")[0])
      tmpDate.setMinutes(time.split(":")[1])
      let utcyear=tmpDate.getUTCFullYear()
      let utcmonth=tmpDate.getUTCMonth()
      let utcday=tmpDate.getUTCDate()
      let utchour=tmpDate.getUTCHours()
      let utcmin=tmpDate.getUTCMinutes()
      let utcinmilseconds=Date.UTC(utcyear,utcmonth, utcday, utchour, utcmin)
      localToUtc.set(time,utcinmilseconds)
      return utcinmilseconds;
  }
  
}

async function init(sport,url1,url2,template,tableselector,result){

  let countriesSB = await template(url1, dateSB,tableselector)
  let countriesOP = await template(url2, dateSB2,tableselector)

  if (countriesOP.totalGame < countriesSB.totalGame * 0.85) {
    throw " odds portal has much less game than scoreboard"
  }
  for (const key in countriesSB.countries) {
    if (countriesOP.countries[key] == null) {
      countriesOP.countries[key] = countriesSB.countries[key]
    }
  }

  let sport_result =[]
  for(const country in countriesSB.countries){
    let tournaments=[]
    for(const tournament in countriesSB.countries[country].tournaments){
      tournaments.push({
          name:tournament,
          games:countriesSB.countries[country].tournaments[tournament]
      })
    }
    sport_result.push({
       country:country,
       tournaments:tournaments
     })
  }

  result[sport]=sport_result

}


async function sbTemplate1(url, datelink,tableselector) {

  await sbGotoPage(page,url,datelink)

  const tables = await page.$$(tableselector)

  let gamecount = 0;
  var countries = {}

  for (const table of tables) {

    let country = await getCountry(table)

    let tournament = await getTournament(table)
    
    await sbTablePreCalc(countries,country,tournament)
 
    await sbTableTemplate1(table,countries[country].tournaments[tournament],gamecount)

  }

  return {
    countries: countries,
    totalGame: gamecount
  }

}

async function sbTemplate2(url, datelink,tableselector) {

  await sbGotoPage(page,url,datelink)

  const tables = await page.$$(tableselector)

  let gamecount = 0;
  let countries = {}


  for (const table of tables) {

    let times = []
    let homes = []
    let aways = []

    let country = await getCountry(table)

    let tournament = await getTournament(table)
    
    await sbTablePreCalc(countries,country,tournament)

    await sbTableTemplate2(page,table,times,homes,aways)

    for (let i = 0; i < times.length; i++) {
      countries[country].tournaments[tournament].push({
        t: getUTC(times[i]),
        h: homes[i],
        a: aways[i]
      })
      gamecount++
    }

  }

  return {
    countries: countries,
    totalGame: gamecount
  }

}

async function sbGotoPage(page,url,datelink){

  
  await page.goto(url)

  await page.waitFor("span[class^='day today']")
  const todayspan = await page.$("span[class^='day today']")
  const todaylink = await todayspan.$("a");
  let todaylinkText = await todayspan.$eval("a", a => a.textContent);
  console.log(todaylinkText)
  todaylink.click()
  await page.waitForSelector("#ifmenu-calendar-content")

  const calendarlinks = await page.$$("#ifmenu-calendar-content a")

  let targetLink;
  for (const link of calendarlinks) {
    let linkinnertext = await page.evaluate(link => link.textContent, link);
    if (linkinnertext.startsWith(datelink)) {
      targetLink = link
      break;
    }
  }

  targetLink.click()
  await page.waitForSelector(".table-main")
  await page.waitFor(5000)

}

async function getCountry(table){
  return await table.$eval(".country_part", td => td.textContent.split(":")[0].trim().toUpperCase());
}

async function getTournament(table){
  return await table.$eval(".tournament_part", td => td.textContent.trim().toUpperCase());
}

async function sbTablePreCalc(countries,country_part,tournament_part){

  if (countries[country_part] == null) {
    countries[country_part] = {
      tournaments: {}
    }
  }
  if (countries[country_part].tournaments[tournament_part] == null) {
    countries[country_part].tournaments[tournament_part] = []
  }

}

async function sbTableTemplate1(table,tournament_val,gamecount){

  const gamestrs = await table.$$("tbody > tr")

  for (const gametr of gamestrs) {

    const gametime = await gametr.$eval("td:nth-child(2)", td => td.textContent);
    const hometeam = await gametr.$eval("td:nth-child(4)", td => td.textContent);
    const awayteam = await gametr.$eval("td:nth-child(6)", td => td.textContent);
    //console.log(gametime+" "+hometeam+"----"+awayteam)
    tournament_val.push({
      t: getUTC(gametime),
      h: hometeam,
      a: awayteam
    })
    gamecount=gamecount+1
  }

}

async function sbTableTemplate2(page,table,times,homes,aways){

  let timetds = await table.$$("td[class^='cell_ad time']")
  for (const td of timetds) {
    let timeText = await page.evaluate(td => td.textContent, td)
    times.push(timeText)
  }

  let hometds = await table.$$("td[class^='cell_ab team-home']")
  for (const td of hometds) {
    let home = await page.evaluate(td => td.textContent, td)
    homes.push(home)
  }

  let awaytds = await table.$$("td[class^='cell_ac team-away']")
  for (const td of awaytds) {
    let away = await page.evaluate(td => td.textContent, td)
    aways.push(away)
  }

}