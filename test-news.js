fetch('http://localhost:3000/api/news/banks?force=1', {
  headers: { 'x-dalal-token': '7f8b9c2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a' }
})
  .then(r => r.json())
  .then(d => console.log('Banks count:', d.length, 'First:', d[0] ? d[0].headline : 'None'))
  .catch(console.error);

fetch('http://localhost:3000/api/news/global?force=1', {
  headers: { 'x-dalal-token': '7f8b9c2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a' }
})
  .then(r => r.json())
  .then(d => console.log('Global count:', d.length, 'First:', d[0] ? d[0].headline : 'None'))
  .catch(console.error);
