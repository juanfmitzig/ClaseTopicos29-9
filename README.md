# API GraphQL de Productos

Proyecto académico: **Express + Apollo Server + MongoDB Atlas (Mongoose)**, pensado para desplegarse en **Render**.

## 1. ¿Qué es cada pieza?

| Pieza | Rol |
|---|---|
| **Express** | Servidor HTTP. Recibe las peticiones y las pasa a los middlewares. |
| **Apollo Server** | Implementa GraphQL: valida la consulta contra el esquema y ejecuta los resolvers. |
| **GraphQL (SDL)** | Contrato de la API: tipos, queries y mutations. |
| **Mongoose** | ODM: define modelos con validaciones sobre MongoDB. |
| **MongoDB Atlas** | Base de datos MongoDB en la nube. |
| **Render** | Plataforma que ejecuta el servidor Node en la nube. |

Flujo de una petición:

```
Cliente (Sandbox) ──POST /graphql──► Express ──► Apollo Server
                                                   │ valida contra typeDefs
                                                   ▼
                                               resolvers ──► Mongoose ──► MongoDB Atlas
```

## 2. Estructura

```
src/
├── config/db.js          PASO 1: conexión a MongoDB
├── models/Product.js     PASO 2: modelo Mongoose (cómo se GUARDAN los datos)
├── graphql/typeDefs.js   PASO 3: esquema SDL (cómo se EXPONEN los datos)
├── graphql/resolvers.js  PASO 4: lógica de cada query/mutation
├── index.js              PASO 5: servidor Express + Apollo
└── seed.js               datos de ejemplo
```

Cada archivo tiene comentarios explicando qué hace cada parte.

## 3. Ejecutar en local

```bash
npm install
cp .env.example .env      # y completa MONGODB_URI
npm run seed              # carga productos de ejemplo
npm run dev               # reinicia al guardar cambios
```

Abre http://localhost:4000/graphql → se muestra **Apollo Sandbox**.

> **Ojo con la URI de Atlas:** el panel de Atlas la muestra como
> `mongodb+srv://<usuario>:<password>@...`. Los signos `< >` son solo marcadores:
> se deben **quitar**. Además conviene agregar el nombre de la base antes del `?`:
> `...mongodb.net/tienda?retryWrites=true&w=majority`

## 4. Introspección y Apollo Sandbox

En `src/index.js`:

- `introspection: true` → permite que el cliente consulte el esquema (`__schema`). Apollo la **apaga por defecto** cuando `NODE_ENV=production`, y Render usa producción, por eso se fuerza.
- `ApolloServerPluginLandingPageLocalDefault({ embed: true })` → al abrir `/graphql` en el navegador se muestra Sandbox embebido también en producción.

> En una API real se suele desactivar la introspección en producción por seguridad; aquí se deja activa con fines educativos.

## 5. Operaciones de ejemplo (copiar en Sandbox)

**Todos los productos**
```graphql
query {
  products {
    id
    name
    price
    stock
    category
    description
  }
}
```

**Filtrar, ordenar y paginar** (usando variables)
```graphql
query Filtrar($filter: ProductFilter, $sort: ProductSort) {
  products(filter: $filter, sort: $sort, limit: 10) {
    id
    name
    price
    stock
    category
  }
}
```
Variables:
```json
{
  "filter": { "category": "electrónica", "minPrice": 20, "maxPrice": 500, "inStock": true },
  "sort": { "field": "PRICE", "order": "DESC" }
}
```

**Buscar por nombre / obtener por id / categorías**
```graphql
query {
  porNombre: products(filter: { name: "café" }) { id name price }
  categories
}
```
```graphql
query { product(id: "PEGA_AQUI_UN_ID") { name price stock } }
```

**Actualizar campos de un producto** (solo se modifican los campos enviados)
```graphql
mutation {
  updateProduct(id: "PEGA_AQUI_UN_ID", input: { price: 19.99, stock: 40 }) {
    id
    name
    price
    stock
  }
}
```

**Ajustar stock (atómico)** — resta 3 unidades; falla si no hay suficiente
```graphql
mutation { adjustStock(id: "PEGA_AQUI_UN_ID", quantity: -3) { name stock } }
```

**Crear y eliminar**
```graphql
mutation {
  createProduct(input: { name: "Monitor 27\"", price: 279.9, stock: 10, category: "Electrónica" }) { id name }
}
```
```graphql
mutation { deleteProduct(id: "PEGA_AQUI_UN_ID") { id name } }
```

## 6. Despliegue en Render

1. **MongoDB Atlas → Network Access → Add IP Address → `0.0.0.0/0`**.
   Render no tiene una IP fija en el plan gratuito, así que hay que permitir cualquier IP.
2. Sube el proyecto a GitHub (el archivo `.env` **no** se sube; está en `.gitignore`).
3. En Render: **New → Web Service** → conecta el repositorio.
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
4. En **Environment** agrega la variable:
   - `MONGODB_URI` = la misma URI de tu `.env`
   (`PORT` la pone Render automáticamente; `DNS_SERVERS` no hace falta).
5. Deploy. Tu API quedará en `https://<tu-servicio>.onrender.com/graphql`.
6. (Opcional) Para cargar datos de ejemplo: ejecuta `npm run seed` en local desde una red que permita conectarse a Atlas, o crea productos con la mutación `createProduct` desde Sandbox. (La pestaña **Shell** de Render solo está en planes de pago.)

> En el plan gratuito Render "duerme" el servicio tras 15 min sin uso; la primera petición puede tardar ~1 min.

## 7. Problemas comunes

| Error | Causa / solución |
|---|---|
| `querySrv ECONNREFUSED` | Node en Windows usa un DNS local que no resuelve SRV. Añade `DNS_SERVERS="8.8.8.8,1.1.1.1"` al `.env`. |
| Se queda colgado / `Server selection timed out` | Tu IP no está permitida en Atlas, o la red bloquea el puerto 27017 (común en Wi‑Fi de universidades). |
| `bad auth : authentication failed` | Usuario/contraseña incorrectos, o quedaron los `< >` en la URI. |
