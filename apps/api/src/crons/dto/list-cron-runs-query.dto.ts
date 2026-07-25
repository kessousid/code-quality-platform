import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

/** Org-wide history, not scoped to any repo — no extra fields beyond pagination. */
export class ListCronRunsQueryDto extends PaginationQueryDto {}
