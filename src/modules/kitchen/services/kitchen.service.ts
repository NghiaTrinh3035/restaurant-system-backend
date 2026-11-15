import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TablesGateway } from 'src/gateway/tables.gateway';
import { PickupOrdersService } from 'src/modules/pickup-orders/services/pickup-orders.service';
import {
  InvoiceStatus,
  KitchenItemStatus,
  PickupOrderStatus,
  Prisma,
  Role,
} from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { QueryKitchenQueueDto } from '../dtos/query-kitchen-queue.dto';
import { UpdateKitchenItemStatusDto } from '../dtos/update-kitchen-item-status.dto';
import { UpdateKitchenBatchStatusDto } from '../dtos/update-kitchen-batch-status.dto';
import { getLocalNow, toDateOnly } from 'src/modules/dine-in/helpers/dine-in.helper';

type DineInBatchPayload = Prisma.OrderBatchGetPayload<{
  include: {
    table: { select: { id: true; tableNumber: true; floor: true } };
    invoice: { select: { id: true; invoiceCode: true; customerName: true } };
    items: {
      include: {
        menuItem: { select: { id: true; name: true; imageUrl: true; preparationTime: true } };
      };
    };
  };
}>;

type PickupOrderPayload = Prisma.PickupOrderGetPayload<{
  include: {
    items: {
      include: {
        menuItem: { select: { id: true; name: true; imageUrl: true; preparationTime: true } };
      };
    };
  };
}>;

@Injectable()
export class KitchenService {
  private readonly logger = new Logger(KitchenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tablesGateway: TablesGateway,
    private readonly pickupOrdersService: PickupOrdersService,
  ) {}

  /**
   * Lấy danh sách hàng đợi các món ăn của bếp chi nhánh (gồm cả món tại bàn và món mang về)
   */
  async getKitchenQueue(query: QueryKitchenQueueDto, user: ICurrentUser) {
    const branchId = this.resolveBranchId(query.branchId, user);

    const now = getLocalNow();
    const today = toDateOnly(now.date);

    // Xây dựng điều kiện lọc trạng thái món tại bàn
    const itemStatusCondition: Prisma.EnumKitchenItemStatusFilter | KitchenItemStatus =
      query.status && query.status !== 'ALL'
        ? query.status
        : { in: [KitchenItemStatus.QUEUED, KitchenItemStatus.PREPARING, KitchenItemStatus.READY] };

    const fetchDineIn = !query.source || query.source === 'ALL' || query.source === 'DINE_IN';
    const fetchPickup = !query.source || query.source === 'ALL' || query.source === 'PICKUP';

    let dineInBatches: DineInBatchPayload[] = [];
    if (fetchDineIn) {
      dineInBatches = await this.prisma.orderBatch.findMany({
        where: {
          branchId,
          invoice: {
            status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAYMENT_PENDING] },
          },
          items: {
            some: { status: itemStatusCondition },
          },
        },
        include: {
          table: {
            select: { id: true, tableNumber: true, floor: true },
          },
          invoice: {
            select: { id: true, invoiceCode: true, customerName: true },
          },
          items: {
            where: { status: itemStatusCondition },
            include: {
              menuItem: {
                select: { id: true, name: true, imageUrl: true, preparationTime: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    let pickupOrders: PickupOrderPayload[] = [];
    if (fetchPickup) {
      pickupOrders = await this.prisma.pickupOrder.findMany({
        where: {
          branchId,
          pickupDate: today,
          status: {
            in: [
              PickupOrderStatus.CONFIRMED,
              PickupOrderStatus.PREPARING,
              PickupOrderStatus.READY,
            ],
          },
        },
        include: {
          items: {
            include: {
              menuItem: {
                select: { id: true, name: true, imageUrl: true, preparationTime: true },
              },
            },
          },
        },
        orderBy: [{ pickupTime: 'asc' }, { createdAt: 'asc' }],
      });
    }

    // Tính toán số lượng KPI của bếp
    let queuedCount = 0;
    let preparingCount = 0;
    let readyCount = 0;

    for (const b of dineInBatches) {
      for (const it of b.items) {
        if (it.status === KitchenItemStatus.QUEUED) queuedCount++;
        else if (it.status === KitchenItemStatus.PREPARING) preparingCount++;
        else if (it.status === KitchenItemStatus.READY) readyCount++;
      }
    }

    for (const p of pickupOrders) {
      if (p.status === PickupOrderStatus.CONFIRMED) queuedCount += p.items.length;
      else if (p.status === PickupOrderStatus.PREPARING) preparingCount += p.items.length;
      else if (p.status === PickupOrderStatus.READY) readyCount += p.items.length;
    }

    return {
      branchId,
      summary: {
        queuedCount,
        preparingCount,
        readyCount,
        totalActive: queuedCount + preparingCount + readyCount,
      },
      dineInBatches,
      pickupOrders,
    };
  }

  /**
   * Bếp trưởng / Quản lý bếp cập nhật trạng thái của từng món ăn riêng lẻ
   */
  async updateOrderItemStatus(
    orderItemId: string,
    dto: UpdateKitchenItemStatusDto,
    user: ICurrentUser,
  ) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        batch: {
          include: {
            table: true,
            invoice: true,
          },
        },
        menuItem: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Không tìm thấy món ăn trong hàng đợi bếp.');
    }

    if (
      (user.role === Role.STAFF || user.role === Role.KITCHEN) &&
      user.branchId &&
      item.batch.branchId !== user.branchId
    ) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên bếp của chi nhánh khác.');
    }

    const now = new Date();
    const updateData: Prisma.OrderItemUpdateInput = {
      status: dto.status,
    };

    if (dto.status === KitchenItemStatus.PREPARING && !item.preparedAt) {
      updateData.preparedAt = now;
    } else if (dto.status === KitchenItemStatus.READY && !item.readyAt) {
      updateData.readyAt = now;
    } else if (dto.status === KitchenItemStatus.SERVED && !item.servedAt) {
      updateData.servedAt = now;
    } else if (dto.status === KitchenItemStatus.CANCELLED) {
      updateData.cancelledReason = dto.cancelledReason || 'Bếp hủy món';
    }

    const updated = await this.prisma.orderItem.update({
      where: { id: orderItemId },
      data: updateData,
      include: {
        batch: {
          include: {
            table: { select: { id: true, tableNumber: true, floor: true } },
          },
        },
        menuItem: { select: { id: true, name: true, imageUrl: true } },
      },
    });

    try {
      this.tablesGateway.notifyKitchenItemStatusChanged(
        item.batch.branchId,
        item.batch.tableId,
        updated,
      );
    } catch {
      // Bỏ qua lỗi socket
    }

    return updated;
  }

  /**
   * Bếp trưởng cập nhật nhanh trạng thái cho toàn bộ món trong một đợt gọi món
   */
  async updateOrderBatchStatus(
    batchId: string,
    dto: UpdateKitchenBatchStatusDto,
    user: ICurrentUser,
  ) {
    const batch = await this.prisma.orderBatch.findUnique({
      where: { id: batchId },
      include: {
        items: true,
        table: true,
      },
    });

    if (!batch) {
      throw new NotFoundException('Không tìm thấy đợt gọi món.');
    }

    if (
      (user.role === Role.STAFF || user.role === Role.KITCHEN) &&
      user.branchId &&
      batch.branchId !== user.branchId
    ) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên bếp của chi nhánh khác.');
    }

    const now = new Date();
    const updateData: Prisma.OrderItemUpdateManyMutationInput = { status: dto.status };
    if (dto.status === KitchenItemStatus.PREPARING) updateData.preparedAt = now;
    else if (dto.status === KitchenItemStatus.READY) updateData.readyAt = now;
    else if (dto.status === KitchenItemStatus.SERVED) updateData.servedAt = now;

    await this.prisma.orderItem.updateMany({
      where: {
        batchId,
        status: { not: KitchenItemStatus.CANCELLED },
      },
      data: updateData,
    });

    const updatedBatch = await this.prisma.orderBatch.findUnique({
      where: { id: batchId },
      include: {
        table: { select: { id: true, tableNumber: true, floor: true } },
        items: {
          include: {
            menuItem: { select: { id: true, name: true, imageUrl: true } },
          },
        },
      },
    });

    try {
      this.tablesGateway.notifyKitchenItemStatusChanged(
        batch.branchId,
        batch.tableId,
        {
          batchId,
          batchNumber: batch.batchNumber,
          tableId: batch.tableId,
          status: dto.status,
          items: updatedBatch?.items,
        },
      );
    } catch {
      // Bỏ qua lỗi socket
    }

    return updatedBatch;
  }

  /**
   * Bếp cập nhật trạng thái đơn mang về (Takeaway Order)
   */
  async updatePickupOrderStatus(
    pickupOrderId: string,
    status: PickupOrderStatus,
    user: ICurrentUser,
  ) {
    return this.pickupOrdersService.updatePickupOrderStatus(
      pickupOrderId,
      { status },
      user,
    );
  }

  private resolveBranchId(queryBranchId?: string, user?: ICurrentUser): string {
    if (user && (user.role === Role.STAFF || user.role === Role.KITCHEN)) {
      if (user.branchId) return user.branchId;
    }
    if (queryBranchId) return queryBranchId;
    throw new BadRequestException(
      'Vui lòng chỉ định branchId chi nhánh cần theo dõi hàng đợi bếp.',
    );
  }
}
