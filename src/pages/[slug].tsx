import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from "next";

import { executeQuery } from "@datocms/cda-client";

type ExampleModel = {
  id: string;
  slug: string;
  title: string;
  textArea: string; // ← match your GraphQL field
};

type CDARequestBody = {
  query: string;
  variables?: Record<string, string>;
};

export default function ExamplePage({
  id,
  slug,
  title,
  textArea,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div>
      <h1>{title}</h1>
      <pre>{textArea}</pre>
      <ul>
        <li>
          ID: <code>{id}</code>
        </li>
        <li>
          Slug: <code>{slug}</code>
        </li>
      </ul>
    </div>
  );
}

const fetchFromDato = async (body: CDARequestBody) => {
  try {
    const result = await executeQuery(body.query, {
      token: process.env.DATOCMS_GRAPHQL_API_KEY!,
      ...(body.variables && { variables: body.variables }),
    });

    return result;
  } catch (err) {
    console.log("Error fetching from DatoCMS:", err);
    throw err;
  }
};

export const getStaticProps = (async ({ params }) => {
  const { slug } = params as { slug?: string };
  if (!slug) {
    return {
      notFound: true,
      revalidate: 5,
    };
  }

  const singleRecordRequestBody = {
    query:
      //language=gql
      `query ($slug: String) {
        exampleModel(filter: { slug: { eq: $slug } }) {
          id
          slug
          title
          textArea
          blah: title
        }
      }
      `,
    variables: { slug },
  };

  const singleRecordResponse = await fetchFromDato(singleRecordRequestBody);

  const { exampleModel: record } = singleRecordResponse as {
    exampleModel: Record<string, string>;
  };

  return {
    props: {
      id: record.id,
      slug: record.slug,
      title: record.title,
      textArea: record.textArea,
    },
    revalidate: 60,
  };
}) satisfies GetStaticProps<ExampleModel>;

export const getStaticPaths: GetStaticPaths = async () => {
  // 1) Get total count
  const slugCountResponse = await fetchFromDato({
    query:
      //language=gql
      `query {
      _allExampleModelsMeta { count }
    }`,
  });
  const {
    _allExampleModelsMeta: { count },
  } = slugCountResponse as { _allExampleModelsMeta: { count: number } };

  // 2) Compute total pages of up to 500 items each
  const ITEMS_PER_PAGE = 500;
  const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

  // 3) Build an array [0,1,2,...,totalPages-1]
  const pages = Array.from({ length: totalPages }, (_, i) => i);

  // 4) Chunk into batches of up to 5 pages
  const MAX_PAGES_PER_CALL = 5;
  const batches: number[][] = [];
  for (let i = 0; i < pages.length; i += MAX_PAGES_PER_CALL) {
    batches.push(pages.slice(i, i + MAX_PAGES_PER_CALL));
  }

  // 5) Fire each batch sequentially, build and concat all results
  const allRecords: Pick<ExampleModel, "id" | "slug">[] = [];

  for (const batch of batches) {
    // a) Dynamically build the sub‐queries for this batch
    const queryFields = batch
      .map((pageIndex) => {
        const skip = pageIndex * ITEMS_PER_PAGE;
        // name each field uniquely so we can pick it out afterward
        const fieldName = `pg_${pageIndex + 1}`;
        return `
          ${fieldName}: allExampleModels(first: ${ITEMS_PER_PAGE}, skip: ${skip}) {
            id
            slug
          }
        `;
      })
      .join("\n");

    // b) Fetch that batch
    const batchQuery = {
      query: `query {
        ${queryFields}
      }`,
    };
    const batchRes = (await fetchFromDato(batchQuery)) as Record<
      string,
      Pick<ExampleModel, "id" | "slug">[]
    >;

    // c) Unpack each page’s results in order
    for (const pageIndex of batch) {
      const fieldName = `pg_${pageIndex + 1}`;
      const records = batchRes[fieldName] ?? [];
      allRecords.push(...records);
    }
  }

  // 6) Build the paths array
  const paths = allRecords.map((rec) => ({
    params: { slug: rec.slug },
  }));

  return {
    paths,
    fallback: true,
  };
};
