import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CyclesService } from './cycles.service';
import { CreateCycleDto } from './dto/cycle.dto';
import { CreateRegistrationDto } from './dto/registration.dto';
import { IngestBatchDto } from '../telemetry/dto/ingest.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReqUser } from './cycles.service';

@ApiTags('cycles')
@ApiBearerAuth()
@Controller('cycles')
export class CyclesController {
  constructor(private svc: CyclesService) {}

  @Get()
  @ApiOperation({ summary: 'List cycles owned by caller' })
  list(@CurrentUser() user: ReqUser, @Query('limit') limit?: string) {
    return this.svc.list(user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new cycle' })
  create(@Body() dto: CreateCycleDto, @CurrentUser() user: ReqUser) {
    return this.svc.create(dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a cycle (cascades its data)' })
  remove(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.svc.remove(id, user);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Aggregated stats for a cycle' })
  stats(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.svc.stats(id, user);
  }

  @Get(':id/visits')
  @ApiOperation({ summary: 'Recent derived feeding-station visits' })
  visits(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Query('limit') limit?: string,
  ) {
    return this.svc.visits(id, user, limit ? Number(limit) : 50);
  }

  @Get(':id/registrations')
  @ApiOperation({ summary: 'Recent manual bird registrations (live arrivals)' })
  registrations(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listRegistrations(id, user, limit ? Number(limit) : 50);
  }

  @Post(':id/registrations')
  @ApiOperation({ summary: 'Log a manual bird registration (live arrival)' })
  addRegistration(
    @Param('id') id: string,
    @Body() dto: CreateRegistrationDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.svc.createRegistration(id, dto, user);
  }

  @Post(':id/ingest')
  @ApiOperation({ summary: 'Ingest a batch of device events for this cycle' })
  ingest(
    @Param('id') id: string,
    @Body() dto: IngestBatchDto,
    @CurrentUser() user: ReqUser,
  ) {
    // Keep cycle_id consistent with the URL param (Anti-IDOR: owner-scoped).
    return this.svc.ingestForCycle(id, dto, user);
  }

  @Get(':id/export.csv')
  @ApiOperation({ summary: 'Export cycle data as CSV (visits|registrations)' })
  async exportCsv(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Res({ passthrough: true }) res: any,
    @Query('type') type?: string,
  ) {
    const kind = type === 'registrations' ? 'registrations' : 'visits';
    const csv = await this.svc.exportCsv(id, user, kind);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cycle-${id.slice(0, 8)}-${kind}.csv"`,
    );
    return csv;
  }
}
