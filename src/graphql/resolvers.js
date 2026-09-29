// =============================================================
// PASO 4: Resolvers
// -------------------------------------------------------------
// Un resolver es la función que "resuelve" (obtiene el valor de)
// un campo del esquema. Su firma es:
//
//     (parent, args, contextValue, info) => valor | Promise<valor>
//
//   - parent: resultado del resolver del nivel superior
//   - args:   argumentos enviados en la operación
//   - contextValue: objeto compartido por toda la petición
//   - info:   metadatos de la consulta (rara vez se usa)
//
// La estructura del objeto debe calzar con los tipos del SDL.
// =============================================================
import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { Product } from '../models/Product.js';

// ---------- Funciones auxiliares ----------

// Escapa caracteres especiales para usar texto del usuario dentro
// de una expresión regular de forma segura.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Lanza un error GraphQL "estándar" si el id no es un ObjectId válido.
function assertValidId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new GraphQLError(`El id "${id}" no es válido`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}

function notFound(id) {
  return new GraphQLError(`No existe un producto con id "${id}"`, {
    extensions: { code: 'NOT_FOUND' },
  });
}

// Convierte los errores de validación de Mongoose en errores
// GraphQL legibles para el cliente.
function handleMongooseError(err) {
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map((e) => e.message);
    throw new GraphQLError(messages.join('. '), {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  throw err;
}

// Traduce el input "ProductFilter" de GraphQL a un filtro de MongoDB.
function buildMongoFilter(filter = {}) {
  const query = {};

  if (filter.name) {
    // $regex con opción "i" = contiene, sin distinguir mayúsculas
    query.name = { $regex: escapeRegex(filter.name), $options: 'i' };
  }

  if (filter.category) {
    // ^...$ = coincidencia exacta, pero sin distinguir mayúsculas
    query.category = { $regex: `^${escapeRegex(filter.category)}$`, $options: 'i' };
  }

  if (filter.minPrice != null || filter.maxPrice != null) {
    query.price = {};
    if (filter.minPrice != null) query.price.$gte = filter.minPrice; // >=
    if (filter.maxPrice != null) query.price.$lte = filter.maxPrice; // <=
  }

  if (filter.inStock != null) {
    query.stock = filter.inStock ? { $gt: 0 } : { $lte: 0 };
  }

  return query;
}

// El enum de GraphQL (NAME, PRICE...) se mapea al campo de Mongo.
const SORT_FIELDS = { NAME: 'name', PRICE: 'price', STOCK: 'stock' };

// ---------- Resolvers ----------

export const resolvers = {
  Query: {
    // Query: products(filter, sort, limit, offset)
    products: async (_parent, { filter, sort, limit, offset }) => {
      const mongoQuery = Product.find(buildMongoFilter(filter));

      if (sort) {
        mongoQuery.sort({ [SORT_FIELDS[sort.field]]: sort.order === 'DESC' ? -1 : 1 });
      }
      if (offset) mongoQuery.skip(Math.max(0, offset));
      if (limit) mongoQuery.limit(Math.min(Math.max(1, limit), 100)); // tope de 100

      return mongoQuery; // Apollo espera la promesa automáticamente
    },

    // Query: product(id)
    product: async (_parent, { id }) => {
      assertValidId(id);
      return Product.findById(id); // null si no existe → GraphQL devuelve null
    },

    // Query: categories
    categories: async () => {
      const categories = await Product.distinct('category');
      return categories.sort();
    },
  },

  Mutation: {
    // Mutation: createProduct(input)
    createProduct: async (_parent, { input }) => {
      try {
        return await Product.create(input);
      } catch (err) {
        handleMongooseError(err);
      }
    },

    // Mutation: updateProduct(id, input)  ← la mutación principal pedida
    updateProduct: async (_parent, { id, input }) => {
      assertValidId(id);

      // Si el cliente envía un campo explícitamente en null, lo
      // ignoramos (no queremos borrar name/price por accidente).
      const changes = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== null && value !== undefined)
      );

      if (Object.keys(changes).length === 0) {
        throw new GraphQLError('Debes enviar al menos un campo para actualizar', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        const updated = await Product.findByIdAndUpdate(
          id,
          { $set: changes },
          {
            returnDocument: 'after', // devuelve el documento YA actualizado
            runValidators: true, // aplica las validaciones del esquema
          }
        );
        if (!updated) throw notFound(id);
        return updated;
      } catch (err) {
        handleMongooseError(err);
      }
    },

    // Mutation: adjustStock(id, quantity)
    // Usa $inc, una operación atómica de MongoDB: si dos clientes
    // compran a la vez, no se "pisan" los valores.
    adjustStock: async (_parent, { id, quantity }) => {
      assertValidId(id);

      // Condición: si restamos, solo actualizar si hay stock suficiente.
      const condition = { _id: id };
      if (quantity < 0) condition.stock = { $gte: -quantity };

      const updated = await Product.findOneAndUpdate(
        condition,
        { $inc: { stock: quantity } },
        { returnDocument: 'after' }
      );

      if (!updated) {
        const exists = await Product.exists({ _id: id });
        if (!exists) throw notFound(id);
        throw new GraphQLError('Stock insuficiente para realizar la operación', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      return updated;
    },

    // Mutation: deleteProduct(id)
    deleteProduct: async (_parent, { id }) => {
      assertValidId(id);
      const deleted = await Product.findByIdAndDelete(id);
      if (!deleted) throw notFound(id);
      return deleted;
    },
  },
};
