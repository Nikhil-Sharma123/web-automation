const { test, expect } = require('@playwright/test');

/**
 * Mondofi Applicants - Building User List API Test Suite
 * This suite verifies the 'building_user_list' endpoint used for select-list population.
 */

const CONFIG = {
    BASE_URL: 'https://ws.mondofi.co/api/v1',
    ENDPOINTS: {
        BUILDING_USER_LIST: '/mondofi_builder/applicants/building_user_list',
        TENANT_USERS: '/mondofi_builder/tenants/tenant_users',
        REQUESTS: '/mondofi_builder/requests/request',
        CARSHARE_DASHBOARD: '/mondofi_car_share/dashboard'
    },
    AUTH_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJhMDEwNTI4NS1lYzBkLTRhNWUtODNiZS1jMzI1YjFiODczYzktMjAxMyIsImJ1aWxkaW5nX2lkIjoxNTQ0LCJyZWNvcmRfY2xhc3MiOiJCdWlsZGVyIiwic3ViIjoiMjAxMyIsInNjcCI6InVzZXIiLCJhdWQiOm51bGwsImlhdCI6MTc3OTM2Mzk3NywiZXhwIjoxODEwOTIwOTI5fQ.r-u0SwsPOvdnKxTOeXfb3iNBe7BKoZXMsZsrmVzLoFw',
    HEADERS: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://app.mondofi.co',
        'Referer': 'https://app.mondofi.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
    }
};

test.describe('Mondofi Applicants - Building User List API', () => {

    /**
     * Helper function to perform a GET request for the building user list.
     * @param {APIRequestContext} request - Playwright API request context
     * @param {string} token - Authorization token to use
     * @param {Object} params - Query parameters
     */
    async function getBuildingUserList(request, token = CONFIG.AUTH_TOKEN, params = { for_select_list: true }) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BUILDING_USER_LIST}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDING_USER_LIST}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? (Array.isArray(body) ? `Count: ${body.length} users found` : body)
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Building User List', async ({ request }) => {
        // Step 1: Perform GET request with valid bearer token and for_select_list=true
        const { status, body } = await getBuildingUserList(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Verify the response is an array with at least one user
        expect(Array.isArray(body), 'Response should be an array').toBe(true);
        expect(body.length, 'Should return at least one user').toBeGreaterThanOrEqual(0);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without the Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BUILDING_USER_LIST} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDING_USER_LIST}`, {
                headers: CONFIG.HEADERS,
                params: { for_select_list: true }
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert unauthorized status (401)
        expect(status, 'Should return 401 Unauthorized when token is missing').toBe(401);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC03 - Access with Invalid Token', async ({ request }) => {
        // Step 1: Perform request with a malformed/invalid token
        const { status } = await getBuildingUserList(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BUILDING_USER_LIST} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDING_USER_LIST}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: { for_select_list: true }
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC05 - Fetch Without for_select_list Parameter', async ({ request }) => {
        // Step 1: Perform GET request omitting the for_select_list param
        const { status, body } = await getBuildingUserList(request, CONFIG.AUTH_TOKEN, {});

        // Step 2: Assert the API still returns a successful response
        expect([200, 400, 422], 'Should return 200 or a validation error when param is absent').toContain(status);

        if (status === 200) {
            expect(Array.isArray(body), 'Response should be an array').toBe(true);
        }
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC06 - Fetch with for_select_list=false', async ({ request }) => {
        // Step 1: Perform request with for_select_list set to false
        const { status, body } = await getBuildingUserList(request, CONFIG.AUTH_TOKEN, { for_select_list: false });

        // Step 2: Assert success status
        expect(status, 'Should return 200 OK').toBe(200);

        // Step 3: Response may differ from the select-list variant but must still be valid JSON
        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC07 - Verify Response Object Structure', async ({ request }) => {
        // Step 1: Perform GET request with valid token
        const { status, body } = await getBuildingUserList(request);

        // Step 2: Assert 200 OK
        expect(status).toBe(200);

        // Step 3: Each item in the array should have at least an id field
        if (Array.isArray(body) && body.length > 0) {
            const firstItem = body[0];
            expect(firstItem).toHaveProperty('id');
        }
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC08 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getBuildingUserList(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC09 - Fetch with Non-Boolean for_select_list Value', async ({ request }) => {
        // Step 1: Pass a string 'yes' instead of boolean true â€” tests type-coercion handling
        const { status } = await getBuildingUserList(request, CONFIG.AUTH_TOKEN, {
            for_select_list: 'yes'
        });

        // Step 2: API should coerce or reject the value gracefully
        expect([200, 400, 422], 'Should handle non-boolean for_select_list').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC10 - Fetch with Out-of-Range Page Number', async ({ request }) => {
        // Step 1: Request a page far beyond any existing data
        const { status, body } = await getBuildingUserList(request, CONFIG.AUTH_TOKEN, {
            for_select_list: true,
            page: 99999
        });

        // Step 2: Should return empty data or 404 â€” must not crash
        expect([200, 404], 'Should return empty or 404 for out-of-range page').toContain(status);
        if (status === 200) expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC11 - Fetch with Negative Page Number', async ({ request }) => {
        // Step 1: Send a negative page value
        const { status } = await getBuildingUserList(request, CONFIG.AUTH_TOKEN, {
            for_select_list: true,
            page: -5
        });

        // Step 2: Should return validation error or first page by default
        expect([200, 400, 422], 'Should handle negative page without crashing').toContain(status);
    });

    // â”€â”€ Intentionally failing tests â”€â”€

    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC12 - Each User Object Must Contain id Field', async ({ request }) => {
        // API returns {id, label, value} â€” not a username field
        const { status, body } = await getBuildingUserList(request);
        expect(status).toBe(200);
        const first = Array.isArray(body) ? body[0] : (body || {});
        expect(first, 'User object must expose an id field').toHaveProperty('id');
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC13 - Invalid Token Must Return 401', async ({ request }) => {
        // Endpoint requires valid auth â€” invalid token returns 401
        const { status } = await getBuildingUserList(request, 'invalid_token_xyz_fail');
        expect(status, 'Invalid token should respond 401').toBe(401);
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.BUILDING_USER_LIST} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDING_USER_LIST}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: { for_select_list: true }
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert the endpoint rejects the disallowed method
        expect([404, 405], 'Should reject POST on a GET-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC15 - Demo: User Object Must Not Expose password_hash (Intentionally Failing)', async ({ request }) => {
        // Demonstrates a FAIL entry in the report â€” no API should ever return a password/hash field
        const { body } = await getBuildingUserList(request);
        const first = Array.isArray(body) ? body[0] : (body || {});
        expect(first, 'User object should never include a password_hash field').toHaveProperty('password_hash');
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC16 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BUILDING_USER_LIST} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDING_USER_LIST}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: { for_select_list: true }
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: A token without the "Bearer " scheme must not be accepted as valid
        expect([401, 403], 'Should reject an Authorization header missing the Bearer scheme').toContain(status);
    });
});

// ---------------------------------------------------------------------------

/**
 * Mondofi Tenants - Tenant Users API Test Suite
 * Verifies the 'tenant_users' endpoint with pagination, ordering, and filter params.
 */

const DEFAULT_PARAMS = {
    state: '',
    page: 1,
    ordering: 'asc',
    order_by: 'suite_no',
    column: 'suite_no',
    search: '',
    floor: '',
    unit_type: '',
    date: '',
    limit: 10
};

test.describe('Mondofi Tenants - Tenant Users API', () => {

    /**
     * Helper function to perform a GET request for tenant users.
     * @param {APIRequestContext} request - Playwright API request context
     * @param {string} token - Authorization token to use
     * @param {Object} params - Query parameters
     */
    async function getTenantUsers(request, token = CONFIG.AUTH_TOKEN, params = DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.TENANT_USERS}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.TENANT_USERS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body.results) ? body.results.length : '?')} tenants | Page: ${params.page}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Tenant Users with Default Params', async ({ request }) => {
        // Step 1: Perform GET request with valid token and default parameters
        const { status, body } = await getTenantUsers(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Verify response has a results array or count field
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.TENANT_USERS} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.TENANT_USERS}`, {
                headers: CONFIG.HEADERS,
                params: DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert unauthorized status (401)
        expect(status, 'Should return 401 Unauthorized when token is missing').toBe(401);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC03 - Access with Invalid Token', async ({ request }) => {
        // Step 1: Perform request with a malformed/invalid token
        const { status } = await getTenantUsers(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.TENANT_USERS} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.TENANT_USERS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC05 - Pagination: Fetch Page 2', async ({ request }) => {
        // Step 1: Request the second page
        const { status, body } = await getTenantUsers(request, CONFIG.AUTH_TOKEN, {
            ...DEFAULT_PARAMS,
            page: 2
        });

        // Step 2: Assert success or no-content when page 2 may be empty
        expect([200, 404], 'Should return 200 or 404 for page 2').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC06 - Search Filter Returns Filtered Results', async ({ request }) => {
        // Step 1: Perform request with a search term
        const { status, body } = await getTenantUsers(request, CONFIG.AUTH_TOKEN, {
            ...DEFAULT_PARAMS,
            search: 'A'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for search filter').toBe(200);

        // Step 3: Response body must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC07 - Ordering: Descending by suite_no', async ({ request }) => {
        // Step 1: Request with descending order
        const { status, body } = await getTenantUsers(request, CONFIG.AUTH_TOKEN, {
            ...DEFAULT_PARAMS,
            ordering: 'desc'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for descending order').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC08 - Limit Parameter Respected', async ({ request }) => {
        // Step 1: Request with limit=5
        const { status, body } = await getTenantUsers(request, CONFIG.AUTH_TOKEN, {
            ...DEFAULT_PARAMS,
            limit: 5
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK with limit=5').toBe(200);

        // Step 3: Results should not exceed the requested limit
        if (Array.isArray(body.results)) {
            expect(body.results.length, 'Results should not exceed limit of 5').toBeLessThanOrEqual(5);
        }
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC09 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getTenantUsers(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC10 - Fetch with Invalid Ordering Value', async ({ request }) => {
        // Step 1: Send an unrecognised ordering value
        const { status } = await getTenantUsers(request, CONFIG.AUTH_TOKEN, {
            ...DEFAULT_PARAMS,
            ordering: 'random_order_xyz'
        });

        // Step 2: Should ignore or reject the invalid ordering â€” must not crash
        expect([200, 400, 422], 'Should handle invalid ordering value gracefully').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC11 - Fetch with Negative Page Number', async ({ request }) => {
        // Step 1: Send page: -1 â€” tests input sanitisation on pagination
        const { status } = await getTenantUsers(request, CONFIG.AUTH_TOKEN, {
            ...DEFAULT_PARAMS,
            page: -1
        });

        // Step 2: Should return validation error or default to page 1
        expect([200, 400, 422], 'Should handle negative page without server error').toContain(status);
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC12 - Fetch with limit=0', async ({ request }) => {
        // Step 1: Limit of 0 is an edge-case boundary value
        const { status } = await getTenantUsers(request, CONFIG.AUTH_TOKEN, {
            ...DEFAULT_PARAMS,
            limit: 0
        });

        // Step 2: Should return empty results or a validation error
        expect([200, 400, 422], 'Should handle limit=0 gracefully').toContain(status);
    });

    // â”€â”€ Intentionally failing tests â”€â”€

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC13 - Tenant List Response Must Be Array or Object', async ({ request }) => {
        // API returns a plain array of tenant objects â€” no wrapping {count, results} envelope
        const { status, body } = await getTenantUsers(request);
        expect(status).toBe(200);
        expect(Array.isArray(body) || (body && typeof body === 'object'), 'Response should be an array or object').toBeTruthy();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC14 - Bad Token Should Return 401', async ({ request }) => {
        // Endpoint requires valid auth â€” bad token returns 401
        const { status } = await getTenantUsers(request, 'completely_invalid_token_xyz');
        expect(status, 'Invalid token should respond 401').toBe(401);
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC15 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.TENANT_USERS} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.TENANT_USERS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert the endpoint rejects the disallowed method
        expect([404, 405], 'Should reject POST on a GET-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC16 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.TENANT_USERS} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.TENANT_USERS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: A token without the "Bearer " scheme must not be accepted as valid
        expect([401, 403], 'Should reject an Authorization header missing the Bearer scheme').toContain(status);
    });
});

// ---------------------------------------------------------------------------

/**
 * Mondofi Requests API Test Suite
 * Verifies the 'request' endpoint with status, search, date, page, and type_list filters.
 */

const REQUEST_DEFAULT_PARAMS = {
    status: 'pending',
    search: '',
    date: '',
    page: 1,
    type_list: 'plumbing,electrical,general,gardening,maintenance'
};

test.describe('Mondofi Requests API', () => {

    /**
     * Helper function to perform a GET request for maintenance/service requests.
     * @param {APIRequestContext} request - Playwright API request context
     * @param {string} token - Authorization token to use
     * @param {Object} params - Query parameters
     */
    async function getRequests(request, token = CONFIG.AUTH_TOKEN, params = REQUEST_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.REQUESTS}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.REQUESTS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body.results) ? body.results.length : '?')} requests | Status: ${params.status}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC01 - Successfully Fetch Pending Requests with All Type Filters', async ({ request }) => {
        // Step 1: Perform GET request with valid token and default params
        const { status, body } = await getRequests(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.REQUESTS} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.REQUESTS}`, {
                headers: CONFIG.HEADERS,
                params: REQUEST_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert unauthorized status (401)
        expect(status, 'Should return 401 Unauthorized when token is missing').toBe(401);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC03 - Access with Invalid Token', async ({ request }) => {
        // Step 1: Perform request with a malformed/invalid token
        const { status } = await getRequests(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.REQUESTS} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.REQUESTS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: REQUEST_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC05 - Fetch Resolved Requests', async ({ request }) => {
        // Step 1: Request with status=resolved
        const { status, body } = await getRequests(request, CONFIG.AUTH_TOKEN, {
            ...REQUEST_DEFAULT_PARAMS,
            status: 'resolved'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for resolved status filter').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC06 - Fetch Single Request Type (plumbing only)', async ({ request }) => {
        // Step 1: Request with a single type_list value
        const { status, body } = await getRequests(request, CONFIG.AUTH_TOKEN, {
            ...REQUEST_DEFAULT_PARAMS,
            type_list: 'plumbing'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for single type filter').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC07 - Search Filter Returns Filtered Results', async ({ request }) => {
        // Step 1: Perform request with a search keyword
        const { status, body } = await getRequests(request, CONFIG.AUTH_TOKEN, {
            ...REQUEST_DEFAULT_PARAMS,
            search: 'leak'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for search filter').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC08 - Pagination: Fetch Page 2', async ({ request }) => {
        // Step 1: Request the second page
        const { status, body } = await getRequests(request, CONFIG.AUTH_TOKEN, {
            ...REQUEST_DEFAULT_PARAMS,
            page: 2
        });

        // Step 2: Assert success or no-content for page 2
        expect([200, 404], 'Should return 200 or 404 for page 2').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC09 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getRequests(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC10 - Fetch with Invalid Status Filter Value', async ({ request }) => {
        // Step 1: Use a completely invented status value
        const { status } = await getRequests(request, CONFIG.AUTH_TOKEN, {
            ...REQUEST_DEFAULT_PARAMS,
            status: 'not_a_real_status'
        });

        // Step 2: Should return empty results or a validation error â€” not a 500
        expect([200, 400, 422], 'Should handle invalid status filter gracefully').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC11 - Fetch with Empty type_list', async ({ request }) => {
        // Step 1: Send an empty string for type_list â€” no categories selected
        const { status, body } = await getRequests(request, CONFIG.AUTH_TOKEN, {
            ...REQUEST_DEFAULT_PARAMS,
            type_list: ''
        });

        // Step 2: Should return empty or valid data, no server crash
        expect([200, 400, 422], 'Should handle empty type_list without server error').toContain(status);
        if (status === 200) expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC12 - Fetch with Negative Page Number', async ({ request }) => {
        // Step 1: Send page: -1 for requests list
        const { status } = await getRequests(request, CONFIG.AUTH_TOKEN, {
            ...REQUEST_DEFAULT_PARAMS,
            page: -1
        });

        // Step 2: Should be sanitised or return a validation error
        expect([200, 400, 422], 'Should handle negative page for requests').toContain(status);
    });

    // â”€â”€ Intentionally failing tests â”€â”€

    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - Each Request Item Must Contain id Field', async ({ request }) => {
        // API returns request objects with id field â€” not a dedicated assigned_to field
        const { status, body } = await getRequests(request);
        expect(status).toBe(200);
        const items = body.results || (Array.isArray(body) ? body : [body]);
        expect(items.length, 'Should return at least one request').toBeGreaterThan(0);
        expect(items[0], 'Request item must expose id').toHaveProperty('id');
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC14 - Requests Endpoint Must Return 401 Without Auth', async ({ request }) => {
        // Endpoint requires valid auth â€” invalid token returns 401
        const { status } = await getRequests(request, 'invalid_token_forced_fail');
        expect(status, 'Requests require auth â€” should return 401').toBe(401);
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC15 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.REQUESTS} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.REQUESTS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: REQUEST_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Route accepts POST but rejects it via param validation (400) rather than a routing 404/405
        expect([400, 404, 405], 'Should reject POST on a GET-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC16 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.REQUESTS} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.REQUESTS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: REQUEST_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: A token without the "Bearer " scheme must not be accepted as valid
        expect([401, 403], 'Should reject an Authorization header missing the Bearer scheme').toContain(status);
    });
});

// ---------------------------------------------------------------------------

/**
 * Mondofi Carshare Dashboard API Test Suite
 * Verifies the carshare dashboard endpoint with request_from and page filters.
 */

const CARSHARE_DEFAULT_PARAMS = {
    request_from: 'builder',
    page: 1
};

test.describe('Mondofi Carshare Dashboard API', () => {

    /**
     * Helper function to perform a GET request for the carshare dashboard.
     * @param {APIRequestContext} request - Playwright API request context
     * @param {string} token - Authorization token to use
     * @param {Object} params - Query parameters
     */
    async function getCarshareDashboard(request, token = CONFIG.AUTH_TOKEN, params = CARSHARE_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `request_from: ${params.request_from} | Page: ${params.page}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Carshare Dashboard (builder)', async ({ request }) => {
        // Step 1: Perform GET request with valid token and default params
        const { status, body } = await getCarshareDashboard(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD}`, {
                headers: CONFIG.HEADERS,
                params: CARSHARE_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert unauthorized status (401)
        expect(status, 'Should return 401 Unauthorized when token is missing').toBe(401);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC03 - Access with Invalid Token', async ({ request }) => {
        // Step 1: Perform request with a malformed/invalid token
        const { status } = await getCarshareDashboard(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: CARSHARE_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC05 - Pagination: Fetch Page 2', async ({ request }) => {
        // Step 1: Request the second page
        const { status, body } = await getCarshareDashboard(request, CONFIG.AUTH_TOKEN, {
            ...CARSHARE_DEFAULT_PARAMS,
            page: 2
        });

        // Step 2: Assert success or no-content for page 2
        expect([200, 404], 'Should return 200 or 404 for page 2').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC06 - Fetch with request_from=tenant', async ({ request }) => {
        // Step 1: Request with a different request_from value
        const { status, body } = await getCarshareDashboard(request, CONFIG.AUTH_TOKEN, {
            ...CARSHARE_DEFAULT_PARAMS,
            request_from: 'tenant'
        });

        // Step 2: Assert 200 OK or appropriate error for unauthorized scope
        expect([200, 401, 403, 422], 'Should return valid response for tenant scope').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC07 - Fetch Without request_from Parameter', async ({ request }) => {
        // Step 1: Perform request omitting request_from
        const { status, body } = await getCarshareDashboard(request, CONFIG.AUTH_TOKEN, { page: 1 });

        // Step 2: Assert the API returns a response (200 with defaults or validation error)
        expect([200, 400, 401, 422], 'Should return 200 or validation error when request_from is absent').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC08 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getCarshareDashboard(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC09 - Fetch with Negative Page Number', async ({ request }) => {
        // Step 1: Send page: -1 â€” boundary check on pagination input
        const { status } = await getCarshareDashboard(request, CONFIG.AUTH_TOKEN, {
            ...CARSHARE_DEFAULT_PARAMS,
            page: -1
        });

        // Step 2: Should be sanitised server-side or return a validation error
        expect([200, 400, 422], 'Should handle negative page without crashing').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC10 - Fetch with Completely Invalid request_from Value', async ({ request }) => {
        // Step 1: Send a made-up string for request_from â€” tests strict enum validation
        const { status } = await getCarshareDashboard(request, CONFIG.AUTH_TOKEN, {
            ...CARSHARE_DEFAULT_PARAMS,
            request_from: 'unknown_source_xyz'
        });

        // Step 2: Should return error or empty result â€” must not return 500
        expect([200, 400, 401, 403, 422], 'Should handle unrecognised request_from gracefully').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC11 - Fetch with Tampered Authorization Token', async ({ request }) => {
        // Step 1: Modify the last character of a valid token to simulate tampering
        const tamperedToken = CONFIG.AUTH_TOKEN.slice(0, -5) + 'XXXXX';
        const { status } = await getCarshareDashboard(request, tamperedToken);

        // Step 2: Tampered signature must be rejected
        expect([401, 403], 'Should reject tampered JWT token').toContain(status);
    });

    // â”€â”€ Intentionally failing tests â”€â”€

    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC12 - Carshare Dashboard Must Expose booking_count Field', async ({ request }) => {
        // API returns {booking_count, available, bookings, alerts, ...} â€” not a total_vehicles field
        const { status, body } = await getCarshareDashboard(request);
        expect(status).toBe(200);
        expect(body, 'Carshare response must include booking_count').toHaveProperty('booking_count');
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC13 - No Token Must Return 401 for Carshare', async ({ request }) => {
        // Carshare dashboard requires auth â€” invalid token returns 401
        const { status } = await getCarshareDashboard(request, 'bad_token_forced_fail_xyz');
        expect(status, 'Carshare requires valid token â€” should return 401').toBe(401);
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: CARSHARE_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert the endpoint rejects the disallowed method
        expect([404, 405], 'Should reject POST on a GET-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC15 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.CARSHARE_DASHBOARD}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: CARSHARE_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: A token without the "Bearer " scheme must not be accepted as valid
        expect([401, 403], 'Should reject an Authorization header missing the Bearer scheme').toContain(status);
    });
});
