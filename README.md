## Content API

[![Netlify Status](https://api.netlify.com/api/v1/badges/b78cb1bb-f9c8-4786-bf8c-4e7af8941137/deploy-status)](https://app.netlify.com/projects/tap-content/deploys)

The API is currently designed as a static JSON based API. The build script
builds the JSON files and assets that are statically served.

All requests are GET requests, as this is a static API.

### Constants

| Constant name      | Description                                  | Value                        |
| ------------------ | -------------------------------------------- | ---------------------------- |
| `image_ext`        | Extension used for images                    | `jpeg`                       |
| `thumbnail_ext`    | Extension used for thumbnails                | `jpeg`                       |
| `thumbnail_width`  | Width of thumbnails                          | `64`                         |
| `thumbnail_height` | Height of thumbnails                         | `64`                         |
| `diagram_ext`      | Extension used for D2 diagram preview images | `png` (transparency support) |

> See [constants.ts](./src/constants.ts) for all constants.

### API Structure

| Path                                                                         | Description                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/search-index.json`                                                         | Global search index                                  |
| `/courses.json`                                                              | List of courses                                      |
| `/courses/{course_code}.json`                                                | Course information                                   |
| `/courses/{course_code}/modules/{module_no}.json`                            | Module information and table of contents             |
| `/courses/{course_code}/modules/{module_no}/chapters/{chapter_no}.json`      | Chapter structure and content in Markdown AST format |
| `/courses/{course_code}/modules/{module_no}/chapters/{chapter_no}.html.json` | Chapter structure and content in HTML                |
| `/courses/{course_code}/module/{module_no}/{image_src}`                      | Retrieve image under the module                      |
| `/images/{image_id}.{image_ext}`                                             | Images in `image_ext` image format                   |
| `/images/thumbnails/{image_id}.{thumbnail_ext}`                              | Images in `thumbnail_ext` image format               |
| `/diagrams/styles.css`                                                       | CSS Styles required for proper diagram rendering     |
| `/diagrams/previews/{diagram_id}.{theme}.{diagram_ext}`                      | Diagram previews in `diagram_ext` image format.      |
| `/diagrams/thumbnails/{diagram_id}.{theme}.{thumbnail_ext}`                  | Diagram thumbnails in `thumbnail_ext` image format.  |

The image sources in all the markdown AST content is relative; e.g.,
`/images/{image_id}.{image_ext}`. Such links must be re-written with the prefix
`$CONTENT_API_ROOT` (the link to the content API) in order to successfully show
the image. But the HTML ones have already rewritten with the prefix `URL`
environment variable (in Netlify's context).

### For Developers & Contributors

- We use Node.js, [`pnpm`](https://pnpm.io), [`tsx`](https://tsx.is) and
  [`dprint`](https://dprint.dev) for convenience.
- Please format the files using `pnpm run fmt`.
- You can run the `dev` script while in-development.

#### Environment variables

| Environment variable name | Description                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `URL`                     | Root of the content API to be used as the prefix for image sources. This naming convention is used for convenient Netlify hosting (Netlify provides the project URL in the `URL` environment variable) |

### License

This project is licensed under MIT.

See [LICENSE](./LICENSE)
