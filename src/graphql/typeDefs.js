// =============================================================
// PASO 3: Esquema GraphQL (SDL = Schema Definition Language)
// -------------------------------------------------------------
// Aquí declaramos el "contrato" de la API: qué tipos existen,
// qué se puede consultar (Query) y qué se puede modificar
// (Mutation). El signo "!" significa "no nulo" (obligatorio).
//
// Los textos entre """ son descripciones: aparecen como
// documentación en Apollo Sandbox gracias a la introspección.
// =============================================================

export const typeDefs = /* GraphQL */ `
  """
  Un producto del catálogo.
  """
  type Product {
    id: ID!
    name: String!
    price: Float!
    stock: Int!
    category: String!
    description: String
  }

  """
  Criterios opcionales para filtrar productos.
  Todos los campos que se envíen se combinan con AND.
  """
  input ProductFilter {
    "Búsqueda parcial por nombre, sin distinguir mayúsculas"
    name: String
    "Categoría exacta (sin distinguir mayúsculas)"
    category: String
    "Precio mínimo (inclusive)"
    minPrice: Float
    "Precio máximo (inclusive)"
    maxPrice: Float
    "true = solo con stock > 0, false = solo sin stock"
    inStock: Boolean
  }

  "Campos por los que se puede ordenar"
  enum ProductSortField {
    NAME
    PRICE
    STOCK
  }

  enum SortOrder {
    ASC
    DESC
  }

  input ProductSort {
    field: ProductSortField!
    order: SortOrder = ASC
  }

  "Datos para crear un producto"
  input CreateProductInput {
    name: String!
    price: Float!
    stock: Int = 0
    category: String!
    description: String
  }

  """
  Datos para actualizar un producto.
  Todos son opcionales: solo se modifican los campos enviados.
  """
  input UpdateProductInput {
    name: String
    price: Float
    stock: Int
    category: String
    description: String
  }

  type Query {
    "Devuelve todos los productos, opcionalmente filtrados, ordenados y paginados"
    products(filter: ProductFilter, sort: ProductSort, limit: Int, offset: Int): [Product!]!

    "Devuelve un producto por su id (o null si no existe)"
    product(id: ID!): Product

    "Lista de categorías distintas existentes"
    categories: [String!]!
  }

  type Mutation {
    "Crea un producto nuevo"
    createProduct(input: CreateProductInput!): Product!

    "Actualiza uno o varios campos de un producto"
    updateProduct(id: ID!, input: UpdateProductInput!): Product!

    "Suma (o resta, si es negativo) unidades al stock de forma atómica"
    adjustStock(id: ID!, quantity: Int!): Product!

    "Elimina un producto y devuelve el producto eliminado"
    deleteProduct(id: ID!): Product!
  }
`;
