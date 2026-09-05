import type { ErSchema } from './types'

// Biblioteca domain — 9 entities covering all specialized Cardinality values
export const bibliotecaSchema: ErSchema = {
  entities: [
    {
      id: 'editora',
      name: 'Editora',
      fields: [
        { id: 'editora_id',   name: 'id',   type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'editora_nome', name: 'nome', type: 'VARCHAR(150)',  isPK: false, isFK: false },
        { id: 'editora_pais', name: 'pais', type: 'VARCHAR(80)',   isPK: false, isFK: false },
      ],
    },
    {
      id: 'categoria',
      name: 'Categoria',
      fields: [
        { id: 'cat_id',        name: 'id',        type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'cat_nome',      name: 'nome',      type: 'VARCHAR(100)', isPK: false, isFK: false },
        { id: 'cat_descricao', name: 'descricao', type: 'TEXT',         isPK: false, isFK: false },
      ],
    },
    {
      id: 'autor',
      name: 'Autor',
      fields: [
        { id: 'autor_id',            name: 'id',            type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'autor_nome',          name: 'nome',          type: 'VARCHAR(150)', isPK: false, isFK: false },
        { id: 'autor_nacionalidade', name: 'nacionalidade', type: 'VARCHAR(80)',  isPK: false, isFK: false },
      ],
    },
    {
      id: 'livro',
      name: 'Livro',
      fields: [
        { id: 'livro_id',             name: 'id',             type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'livro_titulo',         name: 'titulo',         type: 'VARCHAR(200)', isPK: false, isFK: false },
        { id: 'livro_isbn',           name: 'isbn',           type: 'CHAR(13)',     isPK: false, isFK: false },
        { id: 'livro_ano_publicacao', name: 'ano_publicacao', type: 'SMALLINT',     isPK: false, isFK: false },
        {
          id: 'livro_editora_id',
          name: 'editora_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'editora',
        },
        {
          id: 'livro_categoria_id',
          name: 'categoria_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'categoria',
        },
      ],
    },
    {
      id: 'livro_autor',
      name: 'LivroAutor',
      fields: [
        {
          id: 'la_livro_id',
          name: 'livro_id',
          type: 'INTEGER',
          isPK: true, isFK: true,
          referencedEntityId: 'livro',
        },
        {
          id: 'la_autor_id',
          name: 'autor_id',
          type: 'INTEGER',
          isPK: true, isFK: true,
          referencedEntityId: 'autor',
        },
        { id: 'la_ordem', name: 'ordem', type: 'SMALLINT', isPK: false, isFK: false },
      ],
    },
    {
      id: 'usuario',
      name: 'Usuário',
      fields: [
        { id: 'usuario_id',            name: 'id',            type: 'INTEGER',      isPK: true,  isFK: false },
        { id: 'usuario_nome',          name: 'nome',          type: 'VARCHAR(150)', isPK: false, isFK: false },
        { id: 'usuario_email',         name: 'email',         type: 'VARCHAR(200)', isPK: false, isFK: false },
        { id: 'usuario_data_cadastro', name: 'data_cadastro', type: 'DATE',         isPK: false, isFK: false },
      ],
    },
    {
      id: 'emprestimo',
      name: 'Empréstimo',
      fields: [
        { id: 'emp_id',       name: 'id',         type: 'INTEGER', isPK: true,  isFK: false },
        {
          id: 'emp_usuario_id',
          name: 'usuario_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'usuario',
        },
        {
          id: 'emp_livro_id',
          name: 'livro_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'livro',
        },
        { id: 'emp_data_emp', name: 'data_emprestimo', type: 'DATE', isPK: false, isFK: false },
        { id: 'emp_data_dev', name: 'data_devolucao',  type: 'DATE', isPK: false, isFK: false },
      ],
    },
    {
      id: 'multa',
      name: 'Multa',
      fields: [
        { id: 'multa_id',    name: 'id',           type: 'INTEGER',       isPK: true,  isFK: false },
        {
          id: 'multa_emp_id',
          name: 'emprestimo_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'emprestimo',
        },
        { id: 'multa_valor', name: 'valor',  type: 'DECIMAL(10,2)', isPK: false, isFK: false },
        { id: 'multa_paga',  name: 'paga',   type: 'BOOLEAN',       isPK: false, isFK: false },
      ],
    },
    {
      id: 'reserva',
      name: 'Reserva',
      fields: [
        { id: 'reserva_id',     name: 'id',           type: 'INTEGER', isPK: true,  isFK: false },
        {
          id: 'reserva_usu_id',
          name: 'usuario_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'usuario',
        },
        {
          id: 'reserva_liv_id',
          name: 'livro_id',
          type: 'INTEGER',
          isPK: false, isFK: true,
          referencedEntityId: 'livro',
        },
        { id: 'reserva_data',   name: 'data_reserva', type: 'DATE',         isPK: false, isFK: false },
        { id: 'reserva_status', name: 'status',        type: 'VARCHAR(20)',  isPK: false, isFK: false },
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
      label: 'publica',
    },
    // ONE → ZERO_OR_MANY (categoria pode ter zero ou muitos livros)
    {
      id: 'rel_categoria_livro',
      fromEntityId: 'categoria',
      toEntityId: 'livro',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MANY',
      label: 'classifica',
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
      label: 'realiza',
    },
    {
      id: 'rel_emprestimo_livro',
      fromEntityId: 'livro',
      toEntityId: 'emprestimo',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_MANY',
    },
    // ONE → ZERO_OR_ONE (empréstimo pode gerar zero ou uma multa)
    {
      id: 'rel_emprestimo_multa',
      fromEntityId: 'emprestimo',
      toEntityId: 'multa',
      fromCardinality: 'ONE',
      toCardinality: 'ZERO_OR_ONE',
      label: 'gera',
    },
    // ONE → ONE_OR_MANY (cada reserva pertence a exatamente um usuário; usuário faz uma ou muitas reservas)
    {
      id: 'rel_usuario_reserva',
      fromEntityId: 'usuario',
      toEntityId: 'reserva',
      fromCardinality: 'ONE',
      toCardinality: 'ONE_OR_MANY',
      label: 'reserva',
    },
  ],
}
