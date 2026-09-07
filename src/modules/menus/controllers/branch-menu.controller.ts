import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BranchMenuService } from '../services/branch-menu.service';
import {
  QueryBranchMenuDto,
  UpdateBranchMenuAvailabilityDto,
  UpdateBranchMenuStatusDto,
  UpdateBranchMenuPriceDto,
  BulkUpdateBranchMenuDto,
} from '../dto/branch-menu.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../../core/common/decorators/roles.decorator';
import { RolesGuard } from '../../../core/common/guards/roles.guard';
import { CurrentUser } from '../../../core/common/decorators/current-user.decorator';
import { ResponseMessage } from '../../../core/common/decorators/response-message.decorator';
import { Public } from '../../../core/common/decorators/public.decorator';
import type { ICurrentUser } from '../../../core/common/interfaces/current-user.interface';
import { Role } from '@prisma/client';

@ApiTags('Branch Menu')
@Controller('branches/:branchId/menu')
export class BranchMenuController {
  constructor(private readonly branchMenuService: BranchMenuService) {}

  /**
   * Khách hàng xem thực đơn chi nhánh (Public)
   */
  @Get('public')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Khách hàng xem thực đơn chi nhánh (chỉ món đang hoạt động)' })
  @ResponseMessage('Lấy thực đơn chi nhánh thành công.')
  getPublicBranchMenu(
    @Param('branchId') branchId: string,
    @Query() query: QueryBranchMenuDto,
  ) {
    // Với khách hàng, chỉ lấy món đang bán tại chi nhánh
    query.isActive = true;
    return this.branchMenuService.getBranchMenu(branchId, query, {
      id: '',
      email: '',
      role: Role.USER,
    });
  }

  /**
   * Quản lý / Nhân viên xem thực đơn chi nhánh
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Lấy thực đơn chi nhánh (Admin / Nhân viên)' })
  @ResponseMessage('Lấy thực đơn chi nhánh thành công.')
  getBranchMenu(
    @Param('branchId') branchId: string,
    @Query() query: QueryBranchMenuDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.branchMenuService.getBranchMenu(branchId, query, user);
  }

  /**
   * Cập nhật trạng thái Còn hàng / Tạm hết hôm nay (1 chạm)
   */
  @Patch(':menuItemId/availability')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Bật/tắt trạng thái Còn hàng / Tạm hết hôm nay (1 chạm)' })
  @ResponseMessage('Cập nhật trạng thái tình trạng món thành công.')
  updateAvailability(
    @Param('branchId') branchId: string,
    @Param('menuItemId') menuItemId: string,
    @Body() dto: UpdateBranchMenuAvailabilityDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.branchMenuService.updateAvailability(branchId, menuItemId, dto, user);
  }

  /**
   * Cập nhật trạng thái phục vụ / ngừng kinh doanh món tại chi nhánh
   */
  @Patch(':menuItemId/status')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Bật/tắt phục vụ món này tại chi nhánh' })
  @ResponseMessage('Cập nhật trạng thái phục vụ món tại chi nhánh thành công.')
  updateStatus(
    @Param('branchId') branchId: string,
    @Param('menuItemId') menuItemId: string,
    @Body() dto: UpdateBranchMenuStatusDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.branchMenuService.updateStatus(branchId, menuItemId, dto, user);
  }

  /**
   * Thiết lập giá riêng (Price Override) cho chi nhánh
   */
  @Patch(':menuItemId/price')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Cập nhật giá riêng của món tại chi nhánh' })
  @ResponseMessage('Cập nhật giá món chi nhánh thành công.')
  updatePriceOverride(
    @Param('branchId') branchId: string,
    @Param('menuItemId') menuItemId: string,
    @Body() dto: UpdateBranchMenuPriceDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.branchMenuService.updatePriceOverride(branchId, menuItemId, dto, user);
  }

  /**
   * Cập nhật trạng thái hàng loạt cho nhiều món
   */
  @Patch('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Cập nhật trạng thái món hàng loạt' })
  @ResponseMessage('Cập nhật hàng loạt thành công.')
  bulkUpdate(
    @Param('branchId') branchId: string,
    @Body() dto: BulkUpdateBranchMenuDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.branchMenuService.bulkUpdate(branchId, dto, user);
  }

  /**
   * Đồng bộ món mới từ chuỗi vào chi nhánh
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Đồng bộ món ăn mới từ thực đơn chuỗi vào chi nhánh' })
  @ResponseMessage('Đồng bộ thực đơn chi nhánh thành công.')
  syncBranchMenu(
    @Param('branchId') branchId: string,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.branchMenuService.syncBranchMenu(branchId, user);
  }
}
