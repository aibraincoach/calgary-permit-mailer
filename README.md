Calgary Permit Mailer
<img width="1901" height="981" alt="Screenshot 2026-04-29 200115" src="https://github.com/user-attachments/assets/e9fe12a1-65d2-42ce-b384-4821b29be097" />

Calgary Permit Mailer turns the City of Calgary's public building permit data into an automated direct mail engine. Every day, Calgary publishes hundreds of new permit applications — each one representing a contractor actively breaking ground on a new project.

This tool pulls that live data, uses GPT-4o-mini to generate a personalized postcard message for each contractor based on their specific project type, address, and estimated cost, then fires a physical postcard to their site via the PostGrid API — all in seconds, with zero manual effort.

Result

A fully automated B2B outreach pipeline that converts open government data into physical, personalized marketing — the kind of workflow that used to take a person 60+ minutes a day to do manually.

Select your targets, launch the pipeline, watch the postcards queue. Done.

Stack
Node.js
Calgary Open Data API
OpenAI GPT-4o-mini
PostGrid Print & Mail API
Express
Deployed on Vercel
