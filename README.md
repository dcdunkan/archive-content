## Content API

[![Netlify Status](https://api.netlify.com/api/v1/badges/b78cb1bb-f9c8-4786-bf8c-4e7af8941137/deploy-status)](https://app.netlify.com/projects/tap-content/deploys)

The API is currently designed as a static JSON based API. The build script builds the JSON files that are statically served.

All requests are GET requests.

| Path                                                    | Description                     |
| ------------------------------------------------------- | ------------------------------- |
| `/search-index.json`                                    | Global search index             |
| `/courses.json`                                         | List of courses                 |
| `/course/{course_code}.json`                            | Course information              |
| `/course/{course_code}/module/{module_num}.json`        | Module information and content  |
| `/course/{course_code}/module/{module_num}/{image_src}` | Retrieve image under the module |

The image source links in all the markdown content is relative; e.g., `images/graph.jpg`. Such links must be re-written with the suffix `API_ROOT/course/{course_code}/module/{module_num}` in order to successfully show the image.

### For Developers

- We use Node.js, [`pnpm`](https://pnpm.io), [`tsx`](https://tsx.is) and [`dprint`](https://dprint.dev) for convenience.
- Please format the files using `pnpm run fmt`.
- You can run the `dev` script while in-development.
