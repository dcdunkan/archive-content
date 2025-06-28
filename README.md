## Content API

The API is currently designed as a static JSON based API. The build script builds the JSON files that are statically served.

All requests are GET requests.

| Path                                                    | Description                     |
| ------------------------------------------------------- | ------------------------------- |
| `/courses.json`                                         | List of courses                 |
| `/course/{course_code}.json`                            | Course information              |
| `/course/{course_code}/module/{module_num}.json`        | Module information and content  |
| `/course/{course_code}/module/{module_num}/{image_src}` | Retrieve image under the module |

The image source links in all the markdown content is relative; e.g., `images/graph.jpg`. Such links must be re-written with the suffix `API_ROOT/course/{course_code}/module/{module_num}` in order to successfully show the image.
