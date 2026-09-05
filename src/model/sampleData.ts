import type { ErSchema } from './types'

// Library domain — 9 entities covering all specialized Cardinality values
export const bibliotecaSchema: ErSchema = {
  entities: [
    {
      id: 'editora',
      name: 'Publisher',
      fields: [
        { id: 'editora_id',   name: 'id',   type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'editora_nome', name: 'name', type: 'VARCHAR(150)',  isPK: false, isFK: false },
        { id: 'editora_pais', name: 'country', type: 'VARCHAR(80)',   isPK: false, isFK: false },
      ],
    },
    {
      id: 'categoria',
      name: 'Category',
      fields: [
        { id: 'cat_id',        name: 'id',          type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'cat_nome',      name: 'name',        type: 'VARCHAR(100)', isPK: false, isFK: false },
        { id: 'cat_descricao', name: 'description', type: 'TEXT',         isPK: false, isFK: false },
      ],
    },
    {
      id: 'autor',
      name: 'Author',
      fields: [
        { id: 'autor_id',            name: 'id',           type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'autor_nome',          name: 'name',         type: 'VARCHAR(150)', isPK: false, isFK: false },
        { id: 'autor_nacionalidade', name: 'nationality',  type: 'VARCHAR(80)',  isPK: false, isFK: false },
      ],
    },
    {
      id: 'livro',
      name: 'Book',
      fields: [
        { id: 'livro_id',             name: 'id',               type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'livro_titulo',         name: 'title',            type: 'VARCHAR(200)', isPK: false, isFK: false },
        { id: 'livro_isbn',           name: 'isbn',             type: 'CHAR(13)',     isPK: false, isFK: false },
        { id: 'livro_ano_publicacao', name: 'publication_year', type: 'SMALLINT',     isPK: false, isFK: false },
        {
          id: 'livro_editora_id',
          name: 'publisher_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'editora',
        },
        {
          id: 'livro_categoria_id',
          name: 'category_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'categoria',
        },
      ],
    },
    {
      id: 'livro_autor',
      name: 'BookAuthor',
      fields: [
        {
          id: 'la_livro_id',
          name: 'book_id',
          type: 'INTEGER',
          isPK: true, isFK: true,
          referencedEntityId: 'livro',
        },
        {
          id: 'la_autor_id',
          name: 'author_id',
          type: 'INTEGER',
          isPK: true, isFK: true,
          referencedEntityId: 'autor',
        },
        { id: 'la_ordem', name: 'order', type: 'SMALLINT', isPK: false, isFK: false },
      ],
    },
    {
      id: 'usuario',
      name: 'User',
      fields: [
        { id: 'usuario_id',            name: 'id',                type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'usuario_nome',          name: 'name',              type: 'VARCHAR(150)', isPK: false, isFK: false },
        { id: 'usuario_email',         name: 'email',             type: 'VARCHAR(200)', isPK: false, isFK: false },
        { id: 'usuario_data_cadastro', name: 'registration_date', type: 'DATE',         isPK: false, isFK: false },
      ],
    },
    {
      id: 'emprestimo',
      name: 'Loan',
      fields: [
        { id: 'emp_id',       name: 'id',        type: 'INTEGER', isPK: true,  isFK: false },
        {
          id: 'emp_usuario_id',
          name: 'user_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'usuario',
        },
        {
          id: 'emp_livro_id',
          name: 'book_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'livro',
        },
        { id: 'emp_data_emp', name: 'loan_date', type: 'DATE', isPK: false, isFK: false },
        { id: 'emp_data_dev', name: 'due_date',  type: 'DATE', isPK: false, isFK: false },
      ],
    },
    {
      id: 'multa',
      name: 'Fine',
      fields: [
        { id: 'multa_id',    name: 'id',      type: 'INTEGER',       isPK: true,  isFK: false },
        {
          id: 'multa_emp_id',
          name: 'loan_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'emprestimo',
        },
        { id: 'multa_valor', name: 'amount',  type: 'DECIMAL(10,2)', isPK: false, isFK: false },
        { id: 'multa_paga',  name: 'paid',    type: 'BOOLEAN',       isPK: false, isFK: false },
      ],
    },
    {
      id: 'reserva',
      name: 'Reservation',
      fields: [
        { id: 'reserva_id',     name: 'id',               type: 'INTEGER', isPK: true,  isFK: false },
        {
          id: 'reserva_usu_id',
          name: 'user_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'usuario',
        },
        {
          id: 'reserva_liv_id',
          name: 'book_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'livro',
        },
        { id: 'reserva_data',   name: 'reservation_date', type: 'DATE',         isPK: false, isFK: false },
        { id: 'reserva_status', name: 'status',            type: 'VARCHAR(20)',  isPK: false, isFK: false },
      ],
    },
  ],

  // Relationships — covers all specialized Cardinality values
  relationships: [
    // ONE → ZERO_OR_MANY
    {
      id: 'rel_editora_livro',
      fromEntityId: 'editora',
      toEntityId: 'livro',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MANY',
      label: 'publishes',
    },
    // ONE → ZERO_OR_MANY (a category can have zero or many books)
    {
      id: 'rel_categoria_livro',
      fromEntityId: 'categoria',
      toEntityId: 'livro',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MANY',
      label: 'classifies',
    },
    {
      id: 'rel_livro_autor_livro',
      fromEntityId: 'livro',
      toEntityId: 'livro_autor',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MANY',
    },
    {
      id: 'rel_livro_autor_autor',
      fromEntityId: 'autor',
      toEntityId: 'livro_autor',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MANY',
    },
    {
      id: 'rel_emprestimo_usuario',
      fromEntityId: 'usuario',
      toEntityId: 'emprestimo',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MANY',
      label: 'makes',
    },
    {
      id: 'rel_emprestimo_livro',
      fromEntityId: 'livro',
      toEntityId: 'emprestimo',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MANY',
    },
    // ONE → ZERO_OR_ONE (a loan can incur zero or one fine)
    {
      id: 'rel_emprestimo_multa',
      fromEntityId: 'emprestimo',
      toEntityId: 'multa',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_ONE',
      label: 'incurs',
    },
    // ONE → ONE_OR_MANY (each reservation belongs to exactly one user; a user makes one or many reservations)
    {
      id: 'rel_usuario_reserva',
      fromEntityId: 'usuario',
      toEntityId: 'reserva',
      fromCardinality: 'ONE',
      toCardinality: 'ONE_OR_MANY',
      label: 'makes',
    },
  ],
}
