const express = require('express');
const app = express();
app.use(express.json());

const items = [{ id: 1, name: 'item1' }];

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/items', (req, res) => res.json(items));
app.post('/items', (req, res) => {
  const item = { id: items.length + 1, ...req.body };
  items.push(item);
  res.status(201).json(item);
});
app.delete('/items/:id', (req, res) => {
  res.json({ deleted: req.params.id });
});

app.listen(3000, () => console.log('App running on port 3000'));
