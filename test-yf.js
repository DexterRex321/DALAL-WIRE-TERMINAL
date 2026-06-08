import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function test() {
  try {
    const raw3 = await yahooFinance.fundamentalsTimeSeries('RELIANCE.NS', {
      module: 'all',
      type: 'annual',
      period1: '2019-01-01'
    });
    console.log('all + annual types:', Array.from(new Set(raw3.map(r => r.periodType))));
  } catch(e) { console.error('all+annual error', e.message); }

  try {
    const raw4 = await yahooFinance.fundamentalsTimeSeries('RELIANCE.NS', {
      module: 'financials',
      period1: '2019-01-01'
    });
    console.log('financials types:', Array.from(new Set(raw4.map(r => r.periodType))));
  } catch(e) { console.error('financials error', e.message); }
}

test();
