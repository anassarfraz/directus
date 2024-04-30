import type { AuthenticationClient, DirectusClient, RestClient } from '@directus/sdk';
import { createDirectus, rest, authentication } from '@directus/sdk';
import { getPublicURL } from '@/utils/get-root-path';
import { ofetch, type FetchContext } from 'ofetch';
import { useRequestsStore } from './stores/requests';
import { requestQueue } from './api';

export type SdkClient = DirectusClient<any> & AuthenticationClient<any> & RestClient<any>;

type OptionsWithId = FetchContext['options'] & { id: string };

const baseClient = ofetch.create({
	retry: 0,
	ignoreResponseError: true,
	async onRequest({ request, options }) {
		const requestsStore = useRequestsStore();
		const id = requestsStore.startRequest();
		(options as OptionsWithId).id = id;
		const path = getUrlPath(request);

		return new Promise((resolve) => {
			if (path && path === '/auth/refresh') {
				requestQueue.pause();
				return resolve();
			}

			requestQueue.add(() => resolve());
		});
	},
	async onResponse({ options }) {
		const requestsStore = useRequestsStore();
		const id = (options as OptionsWithId).id;
		if (id) requestsStore.endRequest(id);
	},
	async onResponseError({ options }) {
		const requestsStore = useRequestsStore();

		// Note: Cancelled requests don't respond with the config
		const id = (options as OptionsWithId).id;
		if (id) requestsStore.endRequest(id);
	},
	async onRequestError({ options }) {
		const requestsStore = useRequestsStore();

		// Note: Cancelled requests don't respond with the config
		const id = (options as OptionsWithId).id;
		if (id) requestsStore.endRequest(id);
	},
});

export const sdk: SdkClient = createDirectus(getPublicURL(), { globals: { fetch: baseClient } })
	.with(authentication('session', { credentials: 'include', msRefreshBeforeExpires: 10_000 }))
	.with(rest({ credentials: 'include' }));

export default sdk;

function getUrlPath(request: FetchContext['request']): string | null {
	const uri = typeof request === 'string' ? request : request.url;

	try {
		return new URL(uri).pathname;
	} catch {
		return null;
	}
}
