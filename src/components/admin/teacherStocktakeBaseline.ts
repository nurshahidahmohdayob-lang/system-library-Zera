// Snapshot of the Teacher Resource stocktake taken 14 Jul 2026: the 111 books
// that were NOT yet scanned (still out). This is baked into the app so the
// session can always be restored — the librarian can reload it and carry on
// scanning the remaining books even if the browser's saved progress is lost.
//
// Everything else in the Teacher Resource category (the other ~183 books)
// counts as already scanned/present when this baseline is restored.
export const STOCKTAKE_BASELINE_LABEL = '14 Jul 2026 stocktake';

// Barcodes of the 111 books recorded as "not returned" in that stocktake.
export const NOT_RETURNED_BARCODES: string[] = [
  'Zera2661', 'Zera2662', 'Zera2652', 'Zera2667', 'Zera2669', 'Zera2658', 'Zera2596', 'Zera2648',
  'Zera2565', 'Zera2625', 'Zera2595', 'Zera2647', 'Zera2624', 'Zera2643', 'Zera2655', 'Zera2651',
  'Zera2666', 'Zera2670', 'Zera2657', 'Zera2659', 'Zera2663', 'Zera2388', 'Zera2630', 'Zera2561',
  'Zera2592', 'Zera2591', 'Zera2571', 'Zera2602', 'Zera2631', 'Zera2533', 'Zera2531', 'Zera2532',
  'Zera2534', 'Zera2410', 'Zera2442', 'Zera2391', 'Zera2439', 'Zera2469', 'Zera2407', 'Zera2537',
  'Zera2503', 'Zera2646', 'Zera2644', 'Zera2562', 'Zera2563', 'Zera2505', 'Zera2554', 'Zera2412',
  'Zera2411', 'Zera2434', 'Zera2448', 'Zera2512', 'Zera2514', 'Zera2420', 'Zera2480', 'Zera2513',
  'Zera2479', 'Zera2450', 'Zera2449', 'Zera2520', 'Zera2394', 'Zera2488', 'Zera2426', 'Zera2522',
  'Zera2521', 'Zera2456', 'Zera2528', 'Zera2529', 'Zera2494', 'Zera2400', 'Zera2432', 'Zera2462',
  'Zera2530', 'Zera2495', 'Zera2653', 'Zera2496', 'Zera2502', 'Zera2536', 'Zera2614', 'Zera2609',
  'Zera2578', 'Zera2552', 'Zera2546', 'Zera2547', 'Zera2579', 'Zera2585', 'Zera2610', 'Zera2553',
  'Zera2555', 'Zera2611', 'Zera2612', 'Zera2548', 'Zera2414', 'Zera2444', 'Zera2474', 'Zera2508',
  'Zera2542', 'Zera2485', 'Zera2519', 'Zera2484', 'Zera2518', 'Zera2492', 'Zera2526', 'Zera2493',
  'Zera2527', 'Zera2468', 'Zera2406', 'Zera2573', 'Zera2604', 'Zera2586', 'Zera2580',
];
