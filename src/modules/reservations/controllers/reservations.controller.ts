import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/core/common/decorators/public.decorator';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { ReservationsService } from '../services/reservations.service';
import { QueryAvailableSlotsDto } from '../dto/query-available-slots.dto';

@ApiTags('Reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Public()
  @Get('available-slots')
  @ApiOperation({ summary: 'Lấy danh sách các khung giờ phục vụ và bàn trống' })
  @ResponseMessage('Lấy danh sách khung giờ phục vụ thành công')
  getAvailableSlots(@Query() query: QueryAvailableSlotsDto) {
    return this.reservationsService.getAvailableSlots(query);
  }
}
