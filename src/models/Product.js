// =============================================================
// PASO 2: Modelo de datos (Mongoose)
// -------------------------------------------------------------
// El esquema de Mongoose describe cómo se GUARDAN los datos en la
// base. Es distinto del esquema GraphQL (typeDefs), que describe
// cómo se EXPONEN los datos al cliente. Mantenerlos separados es
// una buena práctica: podemos cambiar uno sin romper el otro.
// =============================================================
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'El precio es obligatorio'],
      min: [0, 'El precio no puede ser negativo'],
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'El stock no puede ser negativo'],
      validate: {
        validator: Number.isInteger,
        message: 'El stock debe ser un número entero',
      },
    },
    category: {
      type: String,
      required: [true, 'La categoría es obligatoria'],
      trim: true,
      index: true, // índice: acelera los filtros por categoría
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    // Agrega automáticamente createdAt y updatedAt.
    timestamps: true,
  }
);

// Nota sobre el "id":
// MongoDB guarda el identificador en "_id" (un ObjectId). Mongoose
// expone además un getter virtual "id" que lo devuelve como string,
// por eso en GraphQL podemos declarar el campo "id: ID!" sin
// escribir un resolver extra (siempre que NO usemos .lean()).

export const Product = mongoose.model('Product', productSchema);
