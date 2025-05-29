import type { GetStaticPaths, GetStaticProps } from "next";

type ExampleModel = {
  id: string;
  slug: string;
  title: string;
  textArea: string; // ← match your GraphQL field
};

export default function ExamplePage({
  id,
  slug,
  title,
  textArea,
}: ExampleModel) {
  // You could also use InferGetStaticPropsType<typeof getStaticProps>
  // instead of PageProps here if you prefer.
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

const fetchFromDato = async (body: object) => {
  try {
    const response = await fetch("https://graphql.datocms.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DATOCMS_GRAPHQL_API_KEY}`,
        "X-Exclude-Invalid": "true",
        "X-Environment": "main",
      },
      body: JSON.stringify(body),
    });

    // HTTP error?
    if (!response.ok) {
      console.error(
        `DatoCMS HTTP error: ${response.status} ${response.statusText}`,
      );
      // Optionally you could throw here to bubble up
      // throw new Error(`HTTP Error ${response.status}`);
    }

    const json = await response.json();

    // GraphQL-level errors?
    if (Array.isArray(json.errors) && json.errors.length > 0) {
      console.error("DatoCMS GraphQL errors:", json.errors);
      // Optionally throw if you want to treat GraphQL errors as fatal:
      // throw new Error("GraphQL errors in response");
    }

    return json;
  } catch (err) {
    console.error("Error fetching from DatoCMS:", err);
    throw err; // re-throw so caller knows something went wrong
  }
};

export const getStaticProps = (async ({ params }) => {
  const slug =
    typeof params?.slug === "string" ? params.slug : (params?.slug?.[0] ?? "");

  const recordQuery = {
    query:
      //language=gql
      `
        query ExampleModelQuery($slug: String) {
          exampleModel(filter: { slug: { eq: $slug } }) {
            id
            slug
            title
            textArea
          }
        }
      `,
    variables: { slug },
    operationName: "ExampleModelQuery",
  };

  const {
    data: { exampleModel: record },
  } = await fetchFromDato(recordQuery);

  return {
    props: {
      id: record.id,
      slug: record.slug,
      title: record.title,
      textArea: record.textArea,
    },
    // optional: revalidate every 60s
    // revalidate: 60,
  };
}) satisfies GetStaticProps<ExampleModel>;

export const getStaticPaths = (async () => {
  const allSlugsQuery = {
    query:
      //language=gql
      `
        query AllSlugsQuery {
          allExampleModels(first: 500) {
            id
            slug
          }
        }
      `,
    operationName: "AllSlugsQuery",
  };

  const response = await fetchFromDato(allSlugsQuery);
  const {
    data: { allExampleModels },
  } = response as {
    data: { allExampleModels: Pick<ExampleModel, "id" | "slug">[] };
  };

  return {
    paths: allExampleModels.map((rec) => ({
      params: { slug: rec.slug },
    })),
    fallback: true,
  };
}) satisfies GetStaticPaths;
