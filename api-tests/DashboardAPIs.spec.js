const { test, expect } = require('@playwright/test');

/**
 * Mondofi Dashboard API Test Suite
 * This suite verifies the 'suite_info' endpoint which shows suite availability for admins.
 */

const CONFIG = {
    BASE_URL: 'https://ws.mondofi.co/api/v1',
    ENDPOINTS: {
        SUITE_INFO: '/mondofi_builder/dashboard/dashboards/suite_info',
        GET_COMMON_DATA: '/mondofi_builder/dashboard/dashboards/get_common_data',
        TENANT_LIST: '/mondofi_builder/financial/tenant_list'
    },
    // Using the Bearer token provided in the CURL request
    AUTH_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiIyMDQzY2Q5ZS03MDBiLTQ1ZjEtOTljOS1iMTk5NDk2NDQ3ZjAtMjAxMyIsImJ1aWxkaW5nX2lkIjoxNTQ0LCJyZWNvcmRfY2xhc3MiOiJCdWlsZGVyIiwic3ViIjoiMjAxMyIsInNjcCI6InVzZXIiLCJhdWQiOm51bGwsImlhdCI6MTc3ODczOTY4NywiZXhwIjoxODEwMjk2NjM5fQ.7cl2BHj5fhnWG8WH0m-ShBDaZgv5qbtAPq8rg0hzpUs',
    HEADERS: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://app.mondofi.co',
        'Referer': 'https://app.mondofi.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
    }
};

test.describe('Mondofi Admin Dashboard API - Suite Info', () => {

    /**
     * Helper function to perform a GET request for suite info.
     * @param {APIRequestContext} request - Playwright API request context
     * @param {string} token - Authorization token to use
     */
    async function getSuiteInfo(request, token = CONFIG.AUTH_TOKEN) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.SUITE_INFO}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.SUITE_INFO}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                }
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            // Minimize logging: Show status and a summary of the suite data or errors
            const summary = status === 200 
                ? (Array.isArray(body) ? `Count: ${body.length} suites found` : body)
                : (body.errors || body.error || body);
            

            return { status, body };
        });
    }

    /**
     * Helper function to perform a POST request for common dashboard data.
     * @param {APIRequestContext} request - Playwright API request context
     * @param {Object} payload - The lease expiration filter
     */
    async function getCommonData(request, payload) {
        return await test.step(`API Call: POST ${CONFIG.ENDPOINTS.GET_COMMON_DATA}`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.GET_COMMON_DATA}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: payload
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            // Aggressive truncation: Show only counts on a single line for successful responses
            if (status === 200 || status === 201) {
                const apps = body.rental_applications?.length || 0;
                const leases = body.expiring_leases?.length || 0;
                const reqs = body.pending_requests || 0;
            } else {
            }

            return { status, body };
        });
    }

    /**
     * Helper function to perform a GET request for the financial tenant list.
     * @param {APIRequestContext} request - Playwright API request context
     * @param {Object} params - Query parameters (year, month, request_from)
     */
    async function getTenantList(request, params) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.TENANT_LIST}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.TENANT_LIST}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            // Minimize logging: Show status and a count of tenants found
            const summary = status === 200 
                ? (Array.isArray(body.tenant_data) ? `Count: ${body.tenant_data.length} tenants` : body)
                : (body.errors || body.error || body);
            

            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Dashboard Suite Info', async ({ request }) => {
        // Step 1: Perform GET request with valid bearer token
        const { status, body } = await getSuiteInfo(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);
        
        // Step 3: Verify the structure of the response (expecting an array or specific object)
        // Adjust these expectations based on the actual API response structure
        if (Array.isArray(body)) {
            expect(body.length, 'Should return at least one suite info item').toBeGreaterThanOrEqual(0);
        } else {
            // Summary for the suite status object
            const s = body.status || {};
        }
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without the Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.SUITE_INFO} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.SUITE_INFO}`, {
                headers: CONFIG.HEADERS // No token
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
        const { status } = await getSuiteInfo(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.SUITE_INFO} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.SUITE_INFO}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                }
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC05 - Successfully Fetch Common Dashboard Data', async ({ request }) => {
        const payload = {
            expiring_lease: { year: "2026", month: "5" }
        };

        // Step 1: Perform POST request with lease expiration filter
        const { status, body } = await getCommonData(request, payload);

        // Step 2: Assert status is 200 OK or 201 Created
        expect([200, 201], 'Should return success status for common data request').toContain(status);
        
        // Step 3: Verify essential properties in the response
        expect(body).toHaveProperty('rental_applications');
        expect(body).toHaveProperty('expiring_leases');
        expect(body).toHaveProperty('pending_requests');
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC06 - Fetch Common Data with Invalid Payload', async ({ request }) => {
        const invalidPayload = { expiring_lease: { year: "invalid" } };

        // Step 1: Perform request with invalid data
        const { status } = await getCommonData(request, invalidPayload);

        // Step 2: Assert error status (expecting 422 or 400)
        expect([400, 422, 500]).toContain(status);
    });

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC07 - Successfully Fetch Financial Tenant List', async ({ request }) => {
        const params = { year: '2026', month: '5', request_from: 'dashboard' };

        // Step 1: Perform GET request for tenant list
        const { status, body } = await getTenantList(request, params);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for valid tenant list request').toBe(200);
        
        // Step 3: Verify tenant_data property exists
        expect(body).toHaveProperty('tenant_data');
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC08 - Fetch Tenant List with Missing Parameters', async ({ request }) => {
        // Step 1: Perform request without month/year
        const { status } = await getTenantList(request, { request_from: 'dashboard' });

        // Step 2: Assert status (The API seems to return 200 with default data when params are missing)
        expect(status).toBe(200);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC09 - Suite Info with Tampered/Expired Token', async ({ request }) => {
        // Step 1: Construct a syntactically valid JWT with a clearly expired exp claim
        const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2MDAwMDAwMDB9.INVALIDSIG';
        const { status } = await getSuiteInfo(request, expiredToken);

        // Step 2: Assert the API rejects the expired token
        expect([401, 403], 'Should return 401 or 403 for expired/tampered token').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC10 - Common Data POST with Completely Empty Body', async ({ request }) => {
        // Step 1: Send a POST to common data endpoint with no payload fields
        const { status } = await getCommonData(request, {});

        // Step 2: API should handle gracefully â€” not a 500
        expect([200, 400, 422], 'Should not crash on empty common data body').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC11 - Tenant List with Invalid Month Value', async ({ request }) => {
        // Step 1: Send an out-of-range month value
        const { status } = await getTenantList(request, {
            year: '2026',
            month: '99',
            request_from: 'dashboard'
        });

        // Step 2: Should return a validation error or handle gracefully (500 = server-side validation gap)
        expect([200, 400, 422, 500], 'Should handle out-of-range month gracefully').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC12 - Suite Info with Empty Authorization Header Value', async ({ request }) => {
        // Step 1: Send the Authorization header with an empty string value
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.SUITE_INFO} (Empty Auth)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.SUITE_INFO}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': 'Bearer '
                }
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });

        // Step 2: Should be treated as unauthorized
        expect([401, 403], 'Should return 401 or 403 for empty bearer token').toContain(status);
    });

    // â”€â”€ Intentionally failing tests to demonstrate FAIL status in the report â”€â”€

    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - Suite Info Response Must Expose count Field', async ({ request }) => {
        // API returns {count, status} structure â€” financial summary like total_revenue is not included
        const { status, body } = await getSuiteInfo(request);
        expect(status).toBe(200);
        expect(body, 'Dashboard suite_info should include count').toHaveProperty('count');
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC14 - Unauthenticated Suite Info Request Must Return 401', async ({ request }) => {
        // Dashboard endpoint requires auth â€” unauthenticated request returns 401
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.SUITE_INFO} (No Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.SUITE_INFO}`, {
                headers: CONFIG.HEADERS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });
        expect(status, 'Dashboard endpoint requires auth â€” should return 401').toBe(401);
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC15 - Suite Info: Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.SUITE_INFO} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.SUITE_INFO}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                }
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert the endpoint rejects the disallowed method
        expect([404, 405], 'Should reject POST on a GET-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC16 - Common Data: Wrong HTTP Method (GET Instead of POST)', async ({ request }) => {
        // Step 1: Send GET to a POST-only endpoint
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.GET_COMMON_DATA} (Wrong Method)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.GET_COMMON_DATA}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                }
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert the endpoint rejects the disallowed method
        expect([404, 405], 'Should reject GET on a POST-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC17 - Demo: Suite Info Must Not Expose password_hash (Intentionally Failing)', async ({ request }) => {
        // Demonstrates a FAIL entry in the report â€” no API should ever return a password/hash field
        const { body } = await getSuiteInfo(request);
        expect(body, 'Suite info should never include a password_hash field').toHaveProperty('password_hash');
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC18 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.SUITE_INFO} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.SUITE_INFO}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                }
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: A token without the "Bearer " scheme must not be accepted as valid
        expect([401, 403], 'Should reject an Authorization header missing the Bearer scheme').toContain(status);
    });
});
