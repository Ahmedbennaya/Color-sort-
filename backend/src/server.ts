import app from "./app";
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`Fabric swatch sorter backend listening on http://localhost:${port}`);
});
